import { EventEmitter } from 'events';

const mockAssetDBManager = new EventEmitter() as EventEmitter & { ready: boolean };
mockAssetDBManager.ready = false;

jest.mock('../../assets', () => ({
    assetDBManager: mockAssetDBManager,
}));

import { getCachedPreviewSettings, PreviewNotReadyError } from '../preview-settings';

/**
 * 预览就绪门禁（快速失败）：CLI 常驻 server 模式下，IDE 可能在 asset-db 初始化完成前就请求
 * 预览 settings。此时不能生成缺 builtinAssets 的坏 settings，也不应把请求长时间挂起（挂起会
 * 拖慢 socket.io 加载并可能被 webview 超时掐断）。改为**快速失败**抛 PreviewNotReadyError
 * （路由映射为可重试 503）；CLI 就绪后由 live-reload 广播 browser:reload 让页面自愈重载。
 */
describe('getCachedPreviewSettings readiness gate (fast-fail)', () => {
    beforeEach(() => {
        mockAssetDBManager.ready = false;
        mockAssetDBManager.removeAllListeners();
    });

    it('throws PreviewNotReadyError immediately when asset-db is not ready', async () => {
        await expect(getCachedPreviewSettings()).rejects.toBeInstanceOf(PreviewNotReadyError);
    });

    it('does not block waiting for an assets:ready event (no listener left hanging)', async () => {
        await expect(getCachedPreviewSettings()).rejects.toBeInstanceOf(PreviewNotReadyError);
        // 快速失败路径不注册任何 assets:ready 监听，避免泄漏
        expect(mockAssetDBManager.listenerCount('assets:ready')).toBe(0);
    });
});
