import { join, isAbsolute } from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';

/**
 * 一个项目扩展的预览相关贡献信息。
 */
export interface PreviewExtension {
    /** 扩展名（package.json name），即消息 IPC 的 domain，例如 'localization-editor' */
    name: string;
    /** 扩展根目录绝对路径 */
    dir: string;
    /** 扩展主进程入口绝对路径（package.json main），承载消息处理函数 */
    mainPath?: string;
    /** 扩展 server 贡献入口绝对路径（contributions.server），导出 get/post 路由 */
    serverPath?: string;
    /** contributions.messages：消息名 -> { methods: 主进程导出方法名[] } */
    messages: Record<string, { methods?: string[] }>;
    /** 原始 package.json，供后续按需读取其它贡献 */
    manifest: any;
}

function resolveContribPath(dir: string, p: string | undefined): string | undefined {
    if (!p) {
        return undefined;
    }
    const abs = isAbsolute(p) ? p : join(dir, p);
    return existsSync(abs) ? abs : undefined;
}

/**
 * 扫描 `<project>/extensions/*` 下声明了 server / messages 贡献的扩展。
 * 与 asset-config.ts 中扫描 asset-db mount 的做法一致，只读 package.json，不加载代码。
 */
export function scanPreviewExtensions(projectPath: string): PreviewExtension[] {
    const result: PreviewExtension[] = [];
    const extensionsDir = join(projectPath, 'extensions');
    if (!existsSync(extensionsDir)) {
        return result;
    }
    let entries: import('fs').Dirent[];
    try {
        entries = readdirSync(extensionsDir, { withFileTypes: true });
    } catch {
        return result;
    }
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const dir = join(extensionsDir, entry.name);
        const pkgPath = join(dir, 'package.json');
        if (!existsSync(pkgPath)) {
            continue;
        }
        let manifest: any;
        try {
            manifest = JSON.parse(readFileSync(pkgPath, 'utf8'));
        } catch {
            continue;
        }
        const contributions = manifest?.contributions || {};
        const serverPath = resolveContribPath(dir, contributions.server);
        const messages = (contributions.messages || {}) as Record<string, { methods?: string[] }>;
        // 只关心提供了预览接口（server）或消息处理（messages）的扩展
        if (!serverPath && Object.keys(messages).length === 0) {
            continue;
        }
        const mainPath = resolveContribPath(dir, manifest.main);
        result.push({
            name: manifest.name || entry.name,
            dir,
            mainPath,
            serverPath,
            messages,
            manifest,
        });
    }
    return result;
}
