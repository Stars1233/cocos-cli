/**
 * 回归测试：IDE（PinK）直接编排 lib/* 各步骤的启动路径下，浏览器游戏预览的 `/` 路由必须在
 * 「耗时的资源冷导入（Assets.start / init asset，约 1 分钟）」之前就注册好。
 *
 * 背景 bug：`/` 路由原本只在 `core/scene` 的 `init()` 里通过 registerBrowserPreview 注册，而 IDE
 * 把 `Scene.init()` 排在 `Assets.start`（init asset）之后。这段窗口里 server 已 listen、但 `/`
 * 未注册，浏览器打开预览命中 server.ts 的兜底 404（纯文本 "404 - Not Found"）——拿到一张没有
 * socket.io、没有 browser:reload 监听的裸页，之后 CLI 就绪也无从通知它刷新，永远停在 404。
 *
 * 关键时序：IDE 的 `Assets.start` 早于 `Scripting.init`，且 `Project.init` 是启动最早的一步，
 * 所以提前注册点落在 `Project.init`（早于 asset 冷导入、又已知 projectPath）。本测试锁定该 wiring：
 * 调用 `Project.init` 后 registerBrowserPreview 必须已被调用并带上工程路径。若未来有人挪走/删掉该
 * 提前注册，本测试会失败，提醒早注册退回「初始化期 `/` 裸 404」的老 bug。
 */

import { join } from 'path';

const PROJECT = join('any', 'fake', 'project');

// registerBrowserPreview 是被观测对象：只关心它是否被调用、带什么参数，不真正跑注册。
const registerBrowserPreview = jest.fn(async (_projectPath: string) => { /* no-op */ });
jest.mock('../register', () => ({
    __esModule: true,
    registerBrowserPreview,
}));

// 把 lib 入口对 core 的重依赖桩掉，聚焦「是否提前注册预览」这一 wiring。
const coreProjectOpen = jest.fn(async () => { /* no-op */ });
jest.mock('../../project', () => ({
    __esModule: true,
    default: { open: coreProjectOpen },
}));

import * as Project from '../../../lib/project/project';

describe('lib startup path registers browser preview `/` before asset import', () => {
    beforeEach(() => {
        registerBrowserPreview.mockClear();
        coreProjectOpen.mockClear();
    });

    it('Project.init registers browser preview with the project path (before Assets.start)', async () => {
        await Project.init(PROJECT);

        expect(coreProjectOpen).toHaveBeenCalledWith(PROJECT);
        expect(registerBrowserPreview).toHaveBeenCalledWith(PROJECT);
    });

    it('early register failure never breaks opening the project (failure-isolated)', async () => {
        registerBrowserPreview.mockRejectedValueOnce(new Error('boom'));
        // 预览注册抛错不应让工程打开失败——预览是附加能力，不能阻断启动。
        await expect(Project.init(PROJECT)).resolves.toBeUndefined();
        expect(coreProjectOpen).toHaveBeenCalledTimes(1);
    });
});
