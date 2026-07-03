import { PreviewExtension } from './scanner';

interface Registration {
    ext: PreviewExtension;
    mainModule: any;
}

/**
 * Editor.Message 的 CLI 实现：把 `Editor.Message.request(domain, message, ...args)` 路由到：
 * - domain 为已注册扩展名（含扩展自身 self-IPC）：按 contributions.messages 把 message 映射到
 *   主进程导出的方法名，调用扩展自己的处理函数；
 * - domain === 'asset-db'：映射到 CLI 的 assetManager；
 * - domain === 'scene'：最小桩实现；
 * - 其它：告警并返回 undefined（绝不抛出，避免拖垮预览）。
 */
export class MessageBus {
    private _registry = new Map<string, Registration>();

    register(ext: PreviewExtension, mainModule: any): void {
        this._registry.set(ext.name, { ext, mainModule });
    }

    /** 已注册的扩展主进程模块（供 dispose 时调用各自 unload）。 */
    getRegisteredMains(): { name: string; mainModule: any }[] {
        return Array.from(this._registry.entries()).map(([name, reg]) => ({ name, mainModule: reg.mainModule }));
    }

    async dispatch(domain: string, message: string, ...args: any[]): Promise<any> {
        try {
            const reg = this._registry.get(domain);
            if (reg) {
                return await this._dispatchExtension(reg, message, args);
            }
            if (domain === 'asset-db') {
                return await this._dispatchAssetDb(message, args);
            }
            if (domain === 'scene') {
                return await this._dispatchScene(message);
            }
            if (domain === 'preview') {
                return this._dispatchPreview(message);
            }
            console.warn(`[ExtensionHost] unhandled Editor.Message.request: ${domain}/${message}`);
            return undefined;
        } catch (err) {
            console.warn(`[ExtensionHost] Editor.Message.request ${domain}/${message} failed:`, err);
            return undefined;
        }
    }

    private async _dispatchExtension(reg: Registration, message: string, args: any[]): Promise<any> {
        const decl = reg.ext.messages[message];
        if (!decl || !decl.methods || !decl.methods.length) {
            return undefined;
        }
        let result: any;
        for (const fn of decl.methods) {
            // 跳过面板/渲染进程处理函数（如 'default.executePanelMethod'）—— CLI 无渲染进程
            if (fn.includes('.')) {
                continue;
            }
            const target = reg.mainModule?.methods ?? reg.mainModule;
            const handler = target?.[fn];
            if (typeof handler === 'function') {
                const r = await handler.apply(target, args);
                if (result === undefined && r !== undefined) {
                    result = r;
                }
            }
        }
        return result;
    }

    private async _dispatchAssetDb(message: string, args: any[]): Promise<any> {
        const { assetManager } = await import('../../assets');
        switch (message) {
            case 'query-asset-info':
                return assetManager.queryAssetInfo(args[0]);
            case 'query-asset-info-by-uuid':
                return assetManager.queryAssetInfoByUUID(args[0]);
            case 'query-uuid': {
                const info = assetManager.queryAssetInfo(args[0]);
                return info?.uuid;
            }
            case 'query-path': {
                const info = assetManager.queryAssetInfo(args[0]);
                return (info as any)?.file;
            }
            case 'query-url': {
                const info = assetManager.queryAssetInfo(args[0]);
                return (info as any)?.url;
            }
            case 'query-assets':
                return assetManager.queryAssetInfos(args[0] || {});
            // 预览态下的写操作（reimport/delete/refresh）忽略
            default:
                return undefined;
        }
    }

    private async _dispatchScene(message: string): Promise<any> {
        switch (message) {
            case 'query-is-ready':
                return true;
            case 'query-dirty':
                return false;
            case 'soft-reload':
                // Creator 用 scene/soft-reload 刷新预览；CLI 映射到现有 live-reload 整页刷新
                await this._triggerReload();
                return undefined;
            default:
                return undefined;
        }
    }

    private async _dispatchPreview(message: string): Promise<any> {
        // Creator 用 preview/reload-terminal 刷新预览；CLI 映射到现有 live-reload
        if (message === 'reload-terminal' || message === 'reload') {
            await this._triggerReload();
        }
        return undefined;
    }

    private async _triggerReload(): Promise<void> {
        const { triggerPreviewReload } = await import('../live-reload');
        triggerPreviewReload();
    }
}
