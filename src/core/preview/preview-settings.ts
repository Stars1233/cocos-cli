import type { IPreviewSettingsResult } from '../builder/@types/private';

/**
 * 动态预览的 settings 缓存。
 *
 * `getPreviewSettings()` 本身是无状态函数，每次调用都会重新计算 settings / bundleConfigs。
 * 这里按 `startScene` 维度缓存结果，避免每个 HTTP 请求都重新计算；脚本/资源变化时由
 * live-reload 调 `invalidatePreviewSettings()` 清空缓存，下次请求重新生成。
 */
const cache = new Map<string, IPreviewSettingsResult>();

/**
 * 获取（带缓存的）预览 settings。
 * @param startScene 启动场景的 uuid 或 db:// url，留空表示使用项目默认启动场景
 */
export async function getCachedPreviewSettings(startScene = ''): Promise<IPreviewSettingsResult> {
    const cached = cache.get(startScene);
    if (cached) {
        return cached;
    }
    const { getPreviewSettings, queryDefaultBuildConfigByPlatform } = await import('../builder');
    const { assetManager } = await import('../assets');
    const options = await queryDefaultBuildConfigByPlatform('web-desktop');
    // 解析有效启动场景：显式入参 > 构建配置（扁平或 packages 嵌套）> 项目首个场景。
    // 预览模式下 builder 不会校验/补全 startScene（见 setting-task/asset.ts），
    // 留空或指向已删除的场景都会导致前端请求 /scene/<uuid>.json 404。
    // 因此每个候选都要校验在 asset-db 中真实存在，否则继续回退。
    const candidates = [
        startScene,
        (options as any).startScene,
        (options as any).packages?.['web-desktop']?.startScene,
    ];
    let effectiveScene = '';
    for (const candidate of candidates) {
        if (candidate && assetManager.queryAssetInfo(candidate)) {
            effectiveScene = candidate;
            break;
        }
    }
    if (!effectiveScene) {
        effectiveScene = await resolveDefaultStartScene();
    }
    (options as any).startScene = effectiveScene;
    // 预览模式下注册项目中的全部场景，使运行时 cc.director.loadScene(name)/(uuid) 可加载任意场景，
    // 对齐编辑器预览行为。构建配置里的 scenes 默认只含构建时勾选的子集，会导致脚本里按名
    // loadScene 其它场景时报 "not in the build settings before playing"。
    const allScenes = assetManager.queryAssetInfos({ ccType: 'cc.SceneAsset' }) || [];
    (options as any).scenes = allScenes.map((scene) => ({ url: scene.url, uuid: scene.uuid }));
    const result = await getPreviewSettings(options);

    // 动态预览「只托管不构建」，但 getPreviewSettings 给出的 rendering.effectSettingsPath 默认指向
    // 构建产物 'src/effect.bin'（见 setting-task/utils/project-options.ts）。该文件在预览下不存在，
    // 浏览器请求 GET /src/effect.bin 会 404，引擎再把 404 页面当二进制解析，报
    // "RangeError: Offset is outside the bounds of the DataView"。
    // 自定义渲染管线时改指向动态 effect-settings 路由，与场景编辑器（engine/index.ts）一致，
    // 由服务端从 temp/asset-db/effect/effect.bin 提供。
    const rendering: any = (result as any)?.settings?.rendering;
    if (rendering && rendering.effectSettingsPath) {
        rendering.effectSettingsPath = '/scripting/engine/effect-settings';
    }

    cache.set(startScene, result);
    return result;
}

/**
 * 项目未配置启动场景（或配置已失效）时，回退到项目中的第一个场景资源。
 */
async function resolveDefaultStartScene(): Promise<string> {
    try {
        const { assetManager } = await import('../assets');
        const scenes = assetManager.queryAssetInfos({ ccType: 'cc.SceneAsset' });
        if (scenes && scenes.length) {
            return scenes[0].uuid;
        }
        console.warn('[Preview Server] No scene asset found in project; launch scene will be empty.');
    } catch (err) {
        console.warn('[Preview Server] Failed to resolve default start scene:', err);
    }
    return '';
}

/**
 * 清空预览 settings 缓存。脚本重编译或资源变化后调用。
 */
export function invalidatePreviewSettings(): void {
    cache.clear();
}
