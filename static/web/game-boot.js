/* global window, document, System, globalThis, fetch, location */

import { loadEngine } from '/static/web/engine-loader.js';

/**
 * 浏览器游戏预览运行时引导。
 *
 * 引擎加载流程（SystemJS + import-map + 引擎 bundle）与场景编辑器的 scene-editor-boot.js
 * 共用 engine-loader.js，区别在于这里以 PREVIEW 模式加载，并在结尾调用 cc.game.init(settings)
 * 运行启动场景，而不是加载场景编辑器 bundle。流程对齐编辑器 preview-app/src/main.ts。
 */
export default async function gameBoot() {
    const showError = (e) => {
        const el = document.getElementById('error');
        if (el) {
            el.style.display = 'block';
            el.textContent = (e && (e.stack || e.message)) || String(e);
        }
    };

    try {
        // 以 PREVIEW 模式加载引擎（EDITOR=false / PREVIEW=true）
        const env = await loadEngine({ preview: true });

        const _originalSystem = System;
        const cc = await System.import('cc');
        globalThis.System = _originalSystem;

        // 监听热重载（脚本/资源变化后服务端广播 browser:reload）
        try {
            if (window.io) {
                const socket = window.io(env.serverURL);
                socket.on('browser:reload', () => location.reload());
            }
        } catch (e) {
            console.warn('[Game Preview] live-reload socket unavailable:', e);
        }

        const settings = window._CCSettings || {};
        let launchScene = (settings.launch && settings.launch.launchScene) || '';
        // 启动场景以浏览器地址栏的 ?scene= 为准（uuid 或 db:// url）；
        // 其次用服务端注入的 __launchSceneQuery；都没有时回退到 settings 里的默认场景。
        const sceneOverride = new URLSearchParams(window.location.search).get('scene')
            || new URLSearchParams(window.__launchSceneQuery || '').get('scene');
        if (sceneOverride) {
            launchScene = sceneOverride;
        }

        // 构建引擎启动选项：以 settings 为基础，覆盖资源路径与启动场景（对齐编辑器 main.ts）
        const option = {
            debugMode: (cc.debug && cc.debug.DebugMode && cc.debug.DebugMode.INFO) || 1,
            overrideSettings: Object.assign({}, settings),
        };
        option.overrideSettings.assets = Object.assign({}, option.overrideSettings.assets, {
            // 资源全部由预览服务器动态托管，覆盖掉项目构建配置里可能存在的远程 server 地址
            server: env.serverURL,
            importBase: 'assets/general/import',
            nativeBase: 'assets/general/native',
            remoteBundles: [],
            subpackages: [],
        });
        option.overrideSettings.launch = Object.assign({}, option.overrideSettings.launch, {
            launchScene: '',
        });
        // 强制使用 WebGL 渲染（LegacyRenderMode.WEBGL = 2）。
        // 预览运行在 PREVIEW 模式（EDITOR=false），引擎 device-manager 在 AUTO 模式下
        // 会优先选 WebGPU（!EDITOR && supportWebGPU），而 dev-cli 引擎的 WebGPU 路径存在
        // 管线/绑定问题（vertex UBO 超 12 上限、cubemap 绑到 2D 槽）导致黑屏。
        // 编辑器预览同样走 WebGL，这里与之对齐。
        option.overrideSettings.rendering = Object.assign({}, option.overrideSettings.rendering, {
            renderMode: 2,
        });

        await cc.game.init(option);

        // 分辨率适配策略（仅浏览器预览）：按项目 designResolution 设置套用 ResolutionPolicy，
        // 使预览的拉伸/留边行为与真机构建一致。预览 settings 里的 screen.designResolution.policy
        // 已由构建流程从 fitWidth/fitHeight 换算而来（SHOW_ALL / FIXED_WIDTH / FIXED_HEIGHT / NO_BORDER，
        // 见 builder/worker/builder/index.ts），优先使用；缺省时回退到 fitWidth/fitHeight 规则。
        // 场景编辑器（engine-bootstrap.ts）不走这里，保持 SHOW_ALL。
        try {
            const dr = settings && settings.screen && settings.screen.designResolution;
            if (dr) {
                const drWidth = Number(dr.width) || 1280;
                const drHeight = Number(dr.height) || 720;
                let drPolicy = dr.policy;
                if (drPolicy === undefined || drPolicy === null) {
                    drPolicy = cc.ResolutionPolicy.SHOW_ALL;
                    const fw = dr.fitWidth !== false;
                    const fh = dr.fitHeight === true;
                    if (fw && !fh) drPolicy = cc.ResolutionPolicy.FIXED_WIDTH;
                    else if (!fw && fh) drPolicy = cc.ResolutionPolicy.FIXED_HEIGHT;
                }
                cc.view.setDesignResolutionSize(drWidth, drHeight, drPolicy);
            }
        } catch (e) {
            console.warn('[Game Preview] set design resolution failed:', e);
        }

        await cc.game.run(async () => {
            cc.game.pause();
            const json = await (await fetch(`${env.serverURL}/scene/${encodeURIComponent(launchScene)}.json`)).json();
            try {
                launchScene = json[1]._id;
            } catch (e) {
                // ignore
            }
            cc.assetManager.loadWithJson(
                json,
                { assetId: launchScene },
                () => { /* progress */ },
                (err, sceneAsset) => {
                    if (err) {
                        showError(err);
                        cc.error(err);
                        return;
                    }
                    const scene = sceneAsset.scene;
                    scene._name = sceneAsset._name;
                    cc.director.runSceneImmediate(scene, () => {
                        cc.game.resume();
                    });
                }
            );
        });

        console.log('Cocos game preview started');
    } catch (err) {
        console.error('Failed to start game preview:', err.stack || err);
        showError(err);
    }
}
