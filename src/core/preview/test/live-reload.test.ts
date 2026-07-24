import { EventEmitter } from 'events';

/**
 * live-reload 「首次就绪自愈」回归测试。
 *
 * 场景：IDE 常驻 server 模式下，用户在 CLI 初始化（asset-db 建库 + 内置资源导入）完成前打开
 * 预览页（game.ejs），settings.js 返回 503、首屏 boot 失败。要求预览 settings 首次「真正可用」后
 * （能生成且 builtinAssets 非空，由 isPreviewSettingsReady 判定），服务端把这些「已上报等待自愈」的
 * 预览页**定向** emit browser:reload 使其整页刷新自愈，无需手动刷新；而就绪后才连上、boot 正常的
 * 新页不上报、不应被无谓刷新。
 *
 * 关键：交付与「连接时机」解耦——客户端在每次(重)连接的仍失败态都重报 preview:awaiting-reload，
 * 故初始化期 socket 掉线重连、或多个预览页（Chrome + IDE webview）连接时机不同，都能各自被可靠救回，
 * 不依赖某一瞬的广播（旧一次性 io 广播会概率性漏刷、或只刷到其中一个页面）。
 */

// --- mocks ---------------------------------------------------------------
class FakeSocket extends EventEmitter {
    public id: string;
    public connected = true;
    // 服务端通过 socket.emit('browser:reload') 定向下发；这里记录本 socket 收到的下发。
    public reloads = 0;
    constructor(id: string) {
        super();
        this.id = id;
    }
    emit(event: string, ...args: any[]): boolean {
        if (event === 'browser:reload') {
            this.reloads++;
            return true;
        }
        // 其余事件（preview:awaiting-reload / disconnect）用于测试模拟「客户端 → 服务端」上报，
        // 分发给服务端在本 socket 上注册的处理器。
        return super.emit(event, ...args);
    }
}

class FakeIO extends EventEmitter {
    // io 广播（io.emit('browser:reload')，用于常规热重载：编译/配置/自愈后刷新）
    public broadcasts: string[] = [];
    public sockets = { sockets: new Map<string, FakeSocket>() };
    private seq = 0;

    emit(event: string, ...args: any[]): boolean {
        if (event === 'browser:reload') {
            this.broadcasts.push(event);
            return true;
        }
        return super.emit(event, ...args);
    }

    // 模拟一个预览页连上：加入 sockets 表并派发 connection 事件，返回该 socket
    connectClient(): FakeSocket {
        const socket = new FakeSocket(`s${++this.seq}`);
        this.sockets.sockets.set(socket.id, socket);
        super.emit('connection', socket);
        return socket;
    }

    disconnectClient(socket: FakeSocket): void {
        socket.connected = false;
        this.sockets.sockets.delete(socket.id);
        socket.emit('disconnect'); // 触发服务端在该 socket 上注册的 disconnect 处理器
    }
}
const fakeIO = new FakeIO();

jest.mock('../../../server/socket', () => ({
    socketService: { io: fakeIO },
}));

const scripting = new EventEmitter();
const assetDBManager = new EventEmitter() as EventEmitter & { ready: boolean };
assetDBManager.ready = false;
// 单个资源增删改事件源（保存场景 = asset-change 等），live-reload 会监听它触发热重载。
const assetManager = new EventEmitter();
const configurationManager = new EventEmitter();

jest.mock('../../scripting', () => ({ __esModule: true, default: scripting }));
jest.mock('../../assets', () => ({ assetDBManager, assetManager }));
jest.mock('../../configuration', () => ({ configurationManager }));
jest.mock('../../configuration/script/interface', () => ({
    MessageType: { Update: 'configuration:update', Reload: 'configuration:reload' },
}));

const mockInvalidate = jest.fn();
// isPreviewSettingsReady 由测试通过 settingsReady 变量控制其返回值（模拟 settings 从「未就绪」到「就绪」）。
let settingsReady = false;
jest.mock('../preview-settings', () => ({
    invalidatePreviewSettings: () => mockInvalidate(),
    isPreviewSettingsReady: jest.fn(async () => settingsReady),
}));

import { registerLiveReload, unregisterLiveReload, notePreviewNotReady } from '../live-reload';

const POLL_MS = 1500;

// 让所有已挂起的 microtask（tryHeal 里的 await）跑完
async function flush(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
}

// 模拟客户端上报「本页 boot 失败、等待自愈」（settings.js onerror + connect 时发出）
function reportStuck(socket: FakeSocket): void {
    socket.emit('preview:awaiting-reload');
}

describe('live-reload self-heal when preview settings first become ready', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        fakeIO.broadcasts = [];
        fakeIO.removeAllListeners();
        fakeIO.sockets.sockets.clear();
        scripting.removeAllListeners();
        assetDBManager.removeAllListeners();
        assetManager.removeAllListeners();
        configurationManager.removeAllListeners();
        assetDBManager.ready = false;
        settingsReady = false;
        mockInvalidate.mockClear();
        unregisterLiveReload();
    });

    afterEach(() => {
        unregisterLiveReload();
        jest.useRealTimers();
    });

    it('directs a reload to a client that reported stuck before settings were ready (via asset event)', async () => {
        await registerLiveReload();

        // 预览页在初始化完成前打开：settings.js 503 → 上报等待自愈，此刻不刷新
        const socket = fakeIO.connectClient();
        reportStuck(socket);
        await flush();
        expect(socket.reloads).toBe(0);

        // settings 首次真正可用，随后资源事件到达触发就绪探测
        settingsReady = true;
        assetDBManager.emit('assets:refresh-finish');
        await flush();

        // 定向下发一次 browser:reload 给该 stuck 页
        expect(socket.reloads).toBe(1);
    });

    it('heals via the fallback poll even without any asset event', async () => {
        await registerLiveReload();

        const socket = fakeIO.connectClient();
        reportStuck(socket); // 未就绪期上报，起兜底轮询
        await flush();
        expect(socket.reloads).toBe(0);

        // 没有任何资源事件，仅靠兜底轮询：就绪后下一次 tick 定向刷新
        settingsReady = true;
        jest.advanceTimersByTime(POLL_MS);
        await flush();
        expect(socket.reloads).toBe(1);
    });

    it('still heals an early stuck page whose socket dropped during init and reconnects', async () => {
        await registerLiveReload();

        // 早连页上报等待，随后初始化期 socket ping 超时掉线（从等待集移除）
        const dropped = fakeIO.connectClient();
        reportStuck(dropped);
        await flush();
        fakeIO.disconnectClient(dropped);

        // settings 就绪；掉线的 stuck 页此刻自动重连（新 socket），并在 connect 时重报
        settingsReady = true;
        const reconnected = fakeIO.connectClient();
        reportStuck(reconnected); // 客户端每次(重)连都重报
        await flush();

        // healed 后重报 → 立即定向刷新，救回重连回来的页面
        expect(reconnected.reloads).toBe(1);
        // 掉线的旧 socket 不应收到（早已从等待集移除）
        expect(dropped.reloads).toBe(0);
    });

    it('reloads multiple independent stuck pages (e.g. Chrome + IDE webview)', async () => {
        await registerLiveReload();

        const chrome = fakeIO.connectClient();
        const webview = fakeIO.connectClient();
        reportStuck(chrome);
        reportStuck(webview);
        await flush();
        expect(chrome.reloads).toBe(0);
        expect(webview.reloads).toBe(0);

        settingsReady = true;
        assetDBManager.emit('assets:refresh-finish');
        await flush();

        // 两个页面各自被定向刷新（不再是「只刷到其中一个」）
        expect(chrome.reloads).toBe(1);
        expect(webview.reloads).toBe(1);
    });

    it('does NOT reload a client that connected after settings were ready and booted fine', async () => {
        settingsReady = true;
        await registerLiveReload();

        // 就绪后才连上、boot 正常的页面从不上报，不应触发自愈刷新
        const socket = fakeIO.connectClient();
        await flush();
        assetDBManager.emit('assets:ready'); // 迟到/重复的启动期事件不应触发定向刷新
        await flush();
        jest.advanceTimersByTime(POLL_MS);
        await flush();

        expect(socket.reloads).toBe(0);
        expect(fakeIO.broadcasts).toHaveLength(0);
    });

    it('broadcasts a reload at first-ready when it registered during the init window (defensive)', async () => {
        // 注册时未就绪 → 进入初始化窗口(pendingHeal)。即使没有任何客户端显式上报 stuck，
        // 首次就绪时也应兜底广播一次 browser:reload：此刻凡连着的预览页必是未就绪期打开的 stuck 页，
        // 广播比依赖逐 socket 登记更可靠（登记可能因时序/实例不一致而遗漏）。
        await registerLiveReload();

        settingsReady = true;
        assetDBManager.emit('assets:refresh-finish');
        await flush();

        expect(fakeIO.broadcasts).toEqual(['browser:reload']);
    });

    it('immediately reloads a page that reports stuck after settings are already ready', async () => {
        await registerLiveReload();

        // 中间件已因 503 预热轮询；无客户端时就绪只翻转 healed、无下发
        notePreviewNotReady();
        settingsReady = true;
        jest.advanceTimersByTime(POLL_MS);
        await flush();

        // 之后才连上、且仍 stuck 的页（例如短暂掉线后重连）上报 → healed 路径立即定向刷新
        const late = fakeIO.connectClient();
        reportStuck(late);
        await flush();
        expect(late.reloads).toBe(1);
    });

    it('heals an early page opened BEFORE register, server-driven (no client report needed)', async () => {
        // 浏览器早于 CLI 初始化完成、且早于 registerLiveReload 打开：socket 已在 io.sockets 表中，
        // 但注册前无处理器，其首次 preview:awaiting-reload 上报已丢失。注册时若探测到未就绪，应把
        // 已在册的预览页直接预判为「待自愈」，就绪后由服务端定向刷新，无需依赖客户端上报是否到达。
        const early = fakeIO.connectClient(); // 注册前就已在册，未触发任何服务端处理器
        expect(early.listenerCount('preview:awaiting-reload')).toBe(0);

        await registerLiveReload(); // settingsReady=false → 预判 early 为 stuck 并起兜底轮询
        expect(early.listenerCount('preview:awaiting-reload')).toBe(1); // 仍为其补挂处理器

        // 不做任何 reportStuck：仅靠服务端预判 + 兜底轮询，就绪后即定向刷新
        settingsReady = true;
        jest.advanceTimersByTime(POLL_MS);
        await flush();
        expect(early.reloads).toBe(1);
    });

    it('presumes a page that connects AFTER register but before ready as stuck (no client report)', async () => {
        await registerLiveReload(); // settingsReady=false → 进入初始化窗口(pendingHeal)、起轮询

        // 初始化窗口内新连上的预览页：其 settings.js 此刻也会 503，直接预判 stuck，无需它自己上报
        const page = fakeIO.connectClient();
        await flush();
        expect(page.reloads).toBe(0);

        settingsReady = true;
        jest.advanceTimersByTime(POLL_MS);
        await flush();
        expect(page.reloads).toBe(1);
    });

    it('does not double-bind a socket adopted at register and re-emitting connection', async () => {
        const early = fakeIO.connectClient();
        await registerLiveReload();
        // 再次派发 connection（模拟同一 socket 的重复 connection 事件）不应重复挂载处理器
        (fakeIO as any).emit('connection', early);
        expect(early.listenerCount('preview:awaiting-reload')).toBe(1);

        // 单次上报只应带来单次定向刷新（无重复处理器 → 无重复 emit）
        settingsReady = true;
        reportStuck(early);
        await flush();
        expect(early.reloads).toBe(1);
    });

    it('sets healed at register (no self-heal) when settings are already ready', async () => {
        // 常驻 server / 初始化早已完成：注册时探测到就绪，直接置 healed，后续新开页 boot 正常、不被打扰。
        settingsReady = true;
        await registerLiveReload();

        const socket = fakeIO.connectClient();
        await flush();
        jest.advanceTimersByTime(POLL_MS);
        await flush();
        expect(socket.reloads).toBe(0);
        expect(fakeIO.broadcasts).toHaveLength(0);
    });

    it('still reloads on script recompile via broadcast (existing behavior preserved)', async () => {
        settingsReady = true;
        await registerLiveReload();

        scripting.emit('compiled');
        jest.advanceTimersByTime(200);

        // 编译热重载对所有打开的预览页广播
        expect(fakeIO.broadcasts).toEqual(['browser:reload']);
        expect(mockInvalidate).toHaveBeenCalled();
    });

    it('broadcasts on asset refresh-finish after heal (existing behavior preserved)', async () => {
        await registerLiveReload();

        // 先让一次 stuck 上报 + 就绪把 healed 置位
        const socket = fakeIO.connectClient();
        reportStuck(socket);
        await flush(); // 让首次「未就绪」探测先结算，避免 tryHeal 重入保护吞掉随后的探测
        expect(socket.reloads).toBe(0);
        settingsReady = true;
        assetDBManager.emit('assets:refresh-finish');
        await flush();
        // 首次就绪：定向刷新该 stuck 页 + 兜底广播一次（见 tryHeal）
        expect(socket.reloads).toBe(1);
        expect(fakeIO.broadcasts).toEqual(['browser:reload']);

        // 自愈完成后，refresh-finish 作为常规热重载信号，再走一次 io 广播
        assetDBManager.emit('assets:refresh-finish');
        jest.advanceTimersByTime(200);
        expect(fakeIO.broadcasts).toEqual(['browser:reload', 'browser:reload']);
    });
});
