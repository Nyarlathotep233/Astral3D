/**
 * @author ErSan
 * @email  mlt131220@163.com
 * @date   2024/3/26 9:57
 * @description 全局常量
 */
// 支持的模型格式
export const MODEL_SUPPORT_TYPE = [
    // 普通模型格式
    "gltf","glb","fbx","obj","mtl",
    "3dm","3ds",
    "3mf","amf",
    "dae","drc",
    "kmz","ldr",
    "mpd","md2",
    "pcd","ply",
    "stl","svg",
    "usdz","vox","vtk","vtp",
    "wrl",
    "xyz",
    "json","zip",
    // 自解析格式
    "rvt","rfa","ifc",
    "3DTiles",
    //"osgb",
    // "rvm",
    // "dgn",
    /*"jt"*/
    // "shp",
    // "stp","step"
];

// 资源中心支持上传的格式
export const ASSET_UPLOAD_SUPPORT_TYPE = {
    'Model': ['glb','gltf','fbx','obj'],
    'Material': ['zip'],
    'Texture': ['png','jpg','jpeg','webp'],
    'Billboard': ['png','jpg','jpeg','webp','svg'],
    'HDR': ['hdr','exr'],
    'Tiles': ['zip'],
}

// 需要转换的BIM模型格式
export const NEED_CONVERT_BIM_MODEL = ["rvt"];

// 支持的图纸文件类型
export const DRAWING_SUPPORT_TYPE = ["dwg", "dxf", "png", "jpg", "jpeg"];

// 需要转换的图纸格式
export const NEED_CONVERT_DRAWING = ["dwg"];

// 支持的文档类型
export const DOC_SUPPORT_TYPE = ["doc","docx","xls","xlsx","xlsm","ppt",'pptx',"pdf","txt"];

export const SCENE_TYPE = [
    {label:"城市",value:"城市"},
    {label:"园区",value:"园区"},
    {label:"工厂",value:"工厂"},
    {label:"楼宇",value:"楼宇"},
    {label:"设备",value:"设备"},
    {label:"其他",value:"其他"},
]

// 截屏占位图
export const DefaultScreenshot = "/static/images/placeholder/截屏占位图.png";

