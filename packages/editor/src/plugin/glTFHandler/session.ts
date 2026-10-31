import { Document, WebIO, FileUtils, Transform, Format, Logger } from '@gltf-transform/core';
import type { Packet, KHRXMP } from '@gltf-transform/extensions';
import { unpartition } from '@gltf-transform/functions';
import { Listr } from "./Listr";
import { formatBytes, encodeGLB, XMPContext } from './util.js';
import GLTFHandler from "./glTFHandler";

export class Session {
    private _outputFormat: Format;
    private _display = false;

    constructor(
        private _io: WebIO,
        private _logger: Logger,
        private setLogger: (log: string) => void,
        private _input: string,
        private _inputName: string,
        private _output: string,
    ) {
        _io.setLogger(_logger);
        this._outputFormat = FileUtils.extension(_output) === 'glb' ? Format.GLB : Format.GLTF;
    }

    public static create(handler: GLTFHandler, inputFileUrl: string, inputName: string, output: string): Session {
        return new Session(handler.io, handler.logger, handler.setLogger.bind(handler), inputFileUrl, inputName, output);
    }

    public setDisplay(display: boolean): this {
        this._display = display;
        return this;
    }

    public async transform(...transforms: Transform[]): Promise<File> {
        this.setLogger("Start");

        let _document = this._input
            ? (await this._io.read(this._input)).setLogger(this._logger)
            : new Document().setLogger(this._logger);

        // 警告和消除有损压缩，以避免增加往返的损失。
        for (const extensionName of ['KHR_draco_mesh_compression', 'EXT_meshopt_compression']) {
            const extension = _document
                .getRoot()
                .listExtensionsUsed()
                .find((extension) => extension.extensionName === extensionName);
            if (extension) {
                extension.dispose();
                this._logger.warn(`Decoded ${extensionName}. Further compression will be lossy.`);
            }
        }

        if (this._display) {
            const tasks = [] as { title: string, task: (task: any) => Promise<void> }[];
            for (const transform of transforms) {
                tasks.push({
                    title: transform.name,
                    task: async (task) => {
                        try {
                            this.setLogger(task.title)
                            let time = performance.now();
                            _document = await _document.transform(transform);
                            time = Math.round(performance.now() - time);
                            this.setLogger(task.title.padEnd(20) + ` ${time}ms`)
                        } catch (error: unknown) {
                            // @ts-ignore
                            this.setLogger(`${task.title} run fail: ${error?.message || error}`)
                        }
                    },
                });
            }

            await new Listr(tasks).run();
        } else {
            await _document.transform(...transforms);
        }

        await _document.transform(updateMetadata);

        if (this._outputFormat === Format.GLB) {
            await _document.transform(unpartition());
        }

        const rawU8 = await this._io.writeBinary(_document);

        // 插入 WASM 水印
        let outputUint8Array = rawU8;
        try {
            outputUint8Array = new Uint8Array(await encodeGLB(rawU8, {}));
        } catch (e: any) {
            this._logger.warn('EncodeGLB skipped: ' + (e?.message || e));
        }

        // Uint8Array转file
        const mimeType = this._outputFormat === Format.GLB ? "model/gltf-binary" : "model/gltf+json";
        const blob = new Blob([outputUint8Array], { type: mimeType });
        const outputFile = new File([blob], this._output, { type: mimeType });

        const { lastReadBytes } = this._io;
        const lastWriteBytes = outputUint8Array.byteLength;

        if (!this._input) {
            const output = FileUtils.basename(this._output) + '.' + FileUtils.extension(this._output);
            this._logger.info(`${output} (${formatBytes(lastWriteBytes)})`);
        } else {
            const input = FileUtils.basename(this._inputName) + '.' + FileUtils.extension(this._inputName);
            const output = FileUtils.basename(this._output) + '.' + FileUtils.extension(this._output);
            this._logger.info(
                `${input} (${formatBytes(lastReadBytes)})` + ` → ${output} (${formatBytes(lastWriteBytes)})`,
            );
        }

        this.setLogger("Done")

        return outputFile;
    }
}

function updateMetadata(_document: Document): void {
    const root = _document.getRoot();
    const xmpExtension = root
        .listExtensionsUsed()
        .find((ext) => ext.extensionName === 'KHR_xmp_json_ld') as KHRXMP | null;

    // 不要将KHR_xmp_json_ld添加到尚未使用它的资产中。
    if (!xmpExtension) return;

    const rootPacket = root.getExtension<Packet>('KHR_xmp_json_ld') || xmpExtension.createPacket();

    // xmp:MetadataDate should be the same as, or more recent than, xmp:ModifyDate.
    // https://github.com/adobe/xmp-docs/blob/master/XMPNamespaces/xmp.md
    const date = new Date().toISOString().substring(0, 10);
    rootPacket
        .setContext({ ...rootPacket.getContext(), xmp: XMPContext.xmp })
        .setProperty('xmp:ModifyDate', date)
        .setProperty('xmp:MetadataDate', date);
}
