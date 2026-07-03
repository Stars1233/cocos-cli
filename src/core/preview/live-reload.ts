import { socketService } from '../../server/socket';
import { invalidatePreviewSettings } from './preview-settings';

/**
 * 浏览器热重载。
 *
 * 对齐编辑器：脚本重编译完成或资源刷新结束后，通过 socket.io 广播 `browser:reload`，
 * 浏览器端收到后整页刷新。先清空预览 settings 缓存，保证刷新后取到最新数据。
 *
 * 注意：cocos-cli 没有逐资源级别的变更事件，`assets:refresh-finish` 是整批刷新结束的
 * 粗粒度信号，对整页刷新已足够。
 */
let timer: NodeJS.Timeout | null = null;
let registered = false;
// 保存已注册的监听源与回调，供 unregisterLiveReload 精确解绑，避免预览重启后监听泄漏。
let scriptingRef: { off?: Function; removeListener?: Function } | null = null;
let assetDBRef: { off?: Function; removeListener?: Function } | null = null;
let onCompiled: (() => void) | null = null;
let onRefreshFinish: (() => void) | null = null;

function removeListener(emitter: { off?: Function; removeListener?: Function } | null, event: string, fn: Function | null): void {
    if (!emitter || !fn) {
        return;
    }
    const off = emitter.off || emitter.removeListener;
    off?.call(emitter, event, fn);
}

function scheduleReload(): void {
    invalidatePreviewSettings();
    if (timer) {
        clearTimeout(timer);
    }
    // 去抖：编译/刷新可能短时间内多次触发，合并成一次刷新
    timer = setTimeout(() => {
        timer = null;
        socketService.io?.emit('browser:reload');
    }, 200);
}

/**
 * 主动触发一次浏览器热重载（去抖）。
 * 供扩展宿主映射 Creator 的预览刷新信号（preview/reload-terminal、scene/soft-reload）使用。
 */
export function triggerPreviewReload(): void {
    scheduleReload();
}

/**
 * 注册热重载监听。仅生效一次。
 */
export async function registerLiveReload(): Promise<void> {
    if (registered) {
        return;
    }
    registered = true;

    const { default: scripting } = await import('../scripting');
    const { assetDBManager } = await import('../assets');

    onCompiled = () => scheduleReload();
    onRefreshFinish = () => scheduleReload();
    scriptingRef = scripting as any;
    assetDBRef = assetDBManager as any;

    // 脚本重编译成功
    scripting.on('compiled', onCompiled);
    // 资源批量刷新结束
    assetDBManager.on('assets:refresh-finish', onRefreshFinish);
}

/**
 * 注销热重载监听并清理去抖定时器。预览关闭时调用，避免同进程内重启预览时监听/定时器泄漏。
 */
export function unregisterLiveReload(): void {
    if (!registered) {
        return;
    }
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
    removeListener(scriptingRef, 'compiled', onCompiled);
    removeListener(assetDBRef, 'assets:refresh-finish', onRefreshFinish);
    scriptingRef = null;
    assetDBRef = null;
    onCompiled = null;
    onRefreshFinish = null;
    registered = false;
}
