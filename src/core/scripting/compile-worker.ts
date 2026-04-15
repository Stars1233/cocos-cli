import scripting from './index';

// 监听来自主进程的消息
process.on('message', async (message: any) => {
    if (message && message.type === 'start') {
        try {
            const { projectPath, enginePath, features, assetChanges } = message.data;
            
            // 初始化 Scripting，但不需要驻留 watch，因为这只是单次构建进程
            await scripting.initialize(projectPath, enginePath, features);

            // 执行脚本编译
            await scripting.compileScripts(assetChanges);

            // 编译成功后给主进程发送完成消息
            if (process.send) {
                process.send({ type: 'done' });
            }
            // 确保 PackerDriver 退出并清理资源
            await scripting.close();
            process.exit(0);
        } catch (error: any) {
            console.error('Script compile worker failed:', error);
            if (process.send) {
                process.send({ 
                    type: 'error', 
                    message: error.message, 
                    stack: error.stack 
                });
            }
            process.exit(1);
        }
    }
});
