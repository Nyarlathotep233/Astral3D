export interface ReversibleStep { execute(): void; undo(): void }
export class BatchRecoveryError extends Error {
    readonly recoveryFailed = true;
    errors: unknown[];
    constructor(errors: unknown[], message: string) { super(message); this.name = 'BatchRecoveryError'; this.errors = errors; }
}

/** Session-local transaction. Each inverse must restore even a partially executed step. */
export class AtomicBatchCommand {
    readonly type = 'AtomicBatchCommand';
    readonly atomic = true;
    readonly sessionOnly = true;
    readonly updatable = false;
    id = -1;
    inMemory = true;
    name: string;
    private steps: ReversibleStep[] = [];
    private prepared = false;
    private factories: Array<() => ReversibleStep>;

    constructor(factories: Array<() => ReversibleStep>, name = 'H3D batch') { this.factories = factories; this.name = name; }

    private run(direction: 'execute' | 'undo') {
        const inverse = direction === 'execute' ? 'undo' : 'execute';
        const order = direction === 'execute' ? this.steps : [...this.steps].reverse();
        const attempted: ReversibleStep[] = [];
        try {
            if (!this.prepared) {
                // Capture each inverse against the preceding step, not the pre-batch state.
                for (const factory of this.factories) {
                    const step = factory();
                    this.steps.push(step);
                    attempted.push(step);
                    step.execute();
                }
                this.prepared = true;
            } else {
                for (const step of order) { attempted.push(step); step[direction](); }
            }
        } catch (error) {
            const failures: unknown[] = [];
            for (const step of attempted.reverse()) {
                try { step[inverse](); } catch (restoreError) { failures.push(restoreError); }
            }
            if (!this.prepared) this.steps = [];
            if (failures.length) throw new BatchRecoveryError([error, ...failures], 'Batch failed and recovery failed; inspect the scene before further edits');
            throw error;
        }
    }

    execute() { this.run('execute'); }
    undo() { this.run('undo'); }
    toJSON(): never { throw new Error('H3D batches are session-local; history is not persisted'); }
}
