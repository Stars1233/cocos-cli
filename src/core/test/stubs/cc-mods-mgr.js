/**
 * 单测桩：cc/mods-mgr。
 *
 * 生成的引擎代理文件（packages/cc-module/editor/*.js，如 serialization.js）首行是
 * `require('cc/mods-mgr')`；`cc/mods-mgr` 仅在运行时由 EngineLoader 注入，磁盘上并不存在。
 * 正常单测里这些代理文件会被各用例的 jest.mock 拦截、根本不加载；但 EngineLoader.init 会全局劫持
 * 模块解析并泄漏到后续测试文件（jest maxWorkers:1 串行共用一个 worker），使某些用例的 mock 失配、
 * 真实代理文件被加载，触发 `Cannot find module 'cc/mods-mgr'` —— 该失败与测试文件的执行顺序相关。
 *
 * 本桩经 jest moduleNameMapper 把 `cc/mods-mgr` 兜底到这里，保证任何顺序下都能解析成功、不再因解析
 * 失败而崩溃。syncImport 返回空对象即可（走到此处的用例都已用自己的 jest.mock 覆盖了对应引擎模块的
 * 真实用途，不依赖 mods-mgr 的真实产物）。
 */
module.exports = {
    syncImport() {
        return {};
    },
};
