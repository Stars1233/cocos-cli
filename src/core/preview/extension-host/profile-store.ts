import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

/**
 * Editor.Profile 的 CLI 实现：按 Cocos Creator 的磁盘约定读取扩展配置。
 * - project 作用域：<project>/settings/v2/packages/<name>.json
 * - editor/local 作用域：<project>/profiles/v2/packages/<name>.json
 *
 * 为避免预览过程意外写入用户项目，写操作仅落到内存 overlay（会话内一致），不落盘。
 */
export class ProfileStore {
    private _overlay = new Map<string, any>();

    constructor(private _projectPath: string) { }

    private _file(scope: 'project' | 'config', name: string): string {
        const sub = scope === 'project' ? 'settings' : 'profiles';
        return join(this._projectPath, sub, 'v2', 'packages', `${name}.json`);
    }

    private _readFile(scope: 'project' | 'config', name: string): any {
        const file = this._file(scope, name);
        if (!existsSync(file)) {
            return {};
        }
        try {
            return JSON.parse(readFileSync(file, 'utf8')) ?? {};
        } catch {
            return {};
        }
    }

    private _get(scope: 'project' | 'config', name: string, key?: string): any {
        const overlayKey = `${scope}:${name}`;
        const data = this._overlay.has(overlayKey) ? this._overlay.get(overlayKey) : this._readFile(scope, name);
        return key === undefined ? data : data?.[key];
    }

    private _set(scope: 'project' | 'config', name: string, key: string | undefined, value: any): void {
        const overlayKey = `${scope}:${name}`;
        const data = this._overlay.has(overlayKey) ? this._overlay.get(overlayKey) : { ...this._readFile(scope, name) };
        if (key === undefined) {
            this._overlay.set(overlayKey, value);
        } else {
            data[key] = value;
            this._overlay.set(overlayKey, data);
        }
    }

    private _remove(scope: 'project' | 'config', name: string, key?: string): void {
        const overlayKey = `${scope}:${name}`;
        const data = this._overlay.has(overlayKey) ? this._overlay.get(overlayKey) : { ...this._readFile(scope, name) };
        if (key === undefined) {
            this._overlay.set(overlayKey, {});
        } else {
            delete data[key];
            this._overlay.set(overlayKey, data);
        }
    }

    getProject = async (name: string, key?: string, _scope?: string): Promise<any> => this._get('project', name, key);
    setProject = async (name: string, key: string | undefined, value: any, _scope?: string): Promise<void> => this._set('project', name, key, value);
    removeProject = async (name: string, key?: string, _scope?: string): Promise<void> => this._remove('project', name, key);

    getConfig = async (name: string, key?: string, _scope?: string): Promise<any> => this._get('config', name, key);
    setConfig = async (name: string, key: string | undefined, value: any, _scope?: string): Promise<void> => this._set('config', name, key, value);
    removeConfig = async (name: string, key?: string, _scope?: string): Promise<void> => this._remove('config', name, key);
}
