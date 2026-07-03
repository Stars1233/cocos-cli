import { Request, Response, NextFunction } from 'express';
import { IGetPostConfig, IMiddlewareContribution } from '../../../server/interfaces';

/** 扩展 server 贡献里单条路由的形状（注意键名是 handle，不是 handler）。 */
interface ExtRoute {
    url: string | RegExp;
    handle: (req: Request, res: Response, next?: NextFunction) => any;
}

function convert(routes: ExtRoute[] | undefined, seen: Set<string>): IGetPostConfig[] {
    const out: IGetPostConfig[] = [];
    for (const r of routes || []) {
        if (!r || !r.url || typeof r.handle !== 'function') {
            continue;
        }
        const key = String(r.url);
        if (seen.has(key)) {
            console.warn(`[ExtensionHost] duplicate preview route ignored: ${key}`);
            continue;
        }
        seen.add(key);
        out.push({
            url: r.url,
            handler: async (req: Request, res: Response, next?: NextFunction) => {
                try {
                    await r.handle(req, res, next);
                } catch (err) {
                    if (next) {
                        next(err);
                    } else {
                        console.error(`[ExtensionHost] route handler error for ${key}:`, err);
                        if (!res.headersSent) {
                            res.status(500).end();
                        }
                    }
                }
            },
        });
    }
    return out;
}

/**
 * 把若干扩展 server 贡献的 get/post 路由转换为 CLI 的 IMiddlewareContribution：
 * - handle -> handler（并包一层 try/catch -> next(err)）
 * - 同方法内按 url 去重（先到先得）
 */
export function buildMiddlewareContribution(routeSets: { get?: ExtRoute[]; post?: ExtRoute[] }[]): IMiddlewareContribution {
    const seenGet = new Set<string>();
    const seenPost = new Set<string>();
    const get: IGetPostConfig[] = [];
    const post: IGetPostConfig[] = [];
    for (const set of routeSets) {
        get.push(...convert(set.get, seenGet));
        post.push(...convert(set.post, seenPost));
    }
    return { get, post };
}
