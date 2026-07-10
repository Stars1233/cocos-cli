import { EventEmitter } from 'events';
import { gfx, renderer } from 'cc';
import { Service } from '../core/decorator';
import { ServiceEvents } from '../core/global-events';

export interface IWindowInfo {
    index: number;
    uuid: string;
    name: string;
    window?: any;
}

class PreviewBuffer extends EventEmitter {
    private _name: string;
    device = cc.director.root.device;
    width = Math.floor(cc.director.root.mainWindow.width);
    height = Math.floor(cc.director.root.mainWindow.height);
    data = new Uint8Array(this.width * this.height * 4);
    renderScene: any = null;
    scene: any = null;
    windows: Record<string, any> = {};
    window: any = null;
    regions = [new gfx.BufferTextureCopy()];
    renderData: any;
    queue: any[];
    lock = false;
    _registerName?: string;

    constructor(registerName: string, name: string, scene: any = null) {
        super();
        this.renderData = {
            width: this.width,
            height: this.height,
            buffer: this.data,
        };
        this._name = name;
        this._registerName = registerName;

        if (!scene) {
            const onLoad = (loadedScene: any) => this.onLoadScene(loadedScene);
            ServiceEvents.on('editor:open', onLoad);
            ServiceEvents.on('editor:reload', onLoad);
        } else {
            this.onLoadScene(scene);
        }
        this.regions[0].texExtent.width = this.width;
        this.regions[0].texExtent.height = this.height;
        this.queue = [];
    }

    public resize(width: number, height: number, window: any = null) {
        window || (window = this.window);
        if (!window) { return; }
        width = Math.floor(width);
        height = Math.floor(height);
        this.renderData.width = this.width = width;
        this.renderData.height = this.height = height;
        this.regions[0].texExtent.width = width;
        this.regions[0].texExtent.height = height;
        window.resize(width, height);
        this.renderData.buffer = this.data = new Uint8Array(this.width * this.height * 4);
    }

    public clear() {
        this.resize(0, 0, this.window);
        this.resize(this.width, this.height, this.window);
    }

    ensureWindow(width?: number, height?: number) {
        if (this.window) return;
        if (width && height) {
            this.width = Math.floor(width);
            this.height = Math.floor(height);
            this.renderData.width = this.width;
            this.renderData.height = this.height;
            this.renderData.buffer = this.data = new Uint8Array(this.width * this.height * 4);
            this.regions[0].texExtent.width = this.width;
            this.regions[0].texExtent.height = this.height;
        }
        this.createWindow();
    }

    createWindow(uuid: string | null = null) {
        if (uuid && this.windows[uuid]) {
            this.window = this.windows[uuid];
            return;
        }
        const root = cc.director.root;
        const renderPassInfo = new gfx.RenderPassInfo(
            [new gfx.ColorAttachment(root.mainWindow.swapchain.colorTexture.format)],
            new gfx.DepthStencilAttachment(root.mainWindow.swapchain.depthStencilTexture.format),
        );
        renderPassInfo.colorAttachments[0].barrier = root.device.getGeneralBarrier(
            new gfx.GeneralBarrierInfo(0, gfx.AccessFlagBit.FRAGMENT_SHADER_READ_TEXTURE),
        );
        const window = root.createWindow({
            title: this._name,
            width: this.width,
            height: this.height,
            renderPassInfo,
            isOffscreen: true,
        });
        this.window = window;
        if (uuid) { this.windows[uuid] = window; }
    }

    removeWindow(uuid: string) {
        if (uuid && this.windows[uuid]) {
            cc.director.root.destroyWindow(this.windows[uuid]);
            if (this.windows[uuid] === this.window) { this.window = null; }
            delete this.windows[uuid];
        }
    }

    destroyWindow(window?: any) {
        window = window || this.window;
        if (window) {
            cc.director.root.destroyWindow(window);
            if (window === this.window) { this.window = null; }
        }
    }

    onLoadScene(scene: any) {
        if (!scene || !scene.renderScene) {
            console.warn(`[PreviewBuffer:${this._name}] onLoadScene: invalid scene`, scene);
            return;
        }
        const root = cc.director.root;
        for (const [, window] of Object.entries(this.windows)) {
            root.destroyWindow(window);
        }
        this.windows = {};

        this.scene = scene;
        this.renderScene = scene.renderScene;
        this.emit('loadScene', scene);
    }

    switchCameras(camera: any, currWindow: any) {
        if (currWindow) {
            camera.isWindowSize = false;
            camera.enabled = true;
            camera.changeTargetWindow(currWindow);
            cc.director.root.tempWindow = currWindow;
        }
    }

    public needInvertGFXApi = [
        gfx.API.GLES2,
        gfx.API.GLES3,
        gfx.API.WEBGL,
        gfx.API.WEBGL2,
    ];

    copyFrameBuffer(window: any = null) {
        if (!window || !window.framebuffer) { return this.renderData; }

        const destBuffer = new Uint8Array(this.renderData.buffer.buffer);

        const colorTex = window.framebuffer.colorTextures[0];
        if (colorTex) {
            const gpuTex = colorTex.gpuTexture || colorTex._gpuTexture;
            const gl = (this.device as any).gl as WebGL2RenderingContext | undefined;

            if (gl && gpuTex?.glTexture) {
                const tempFBO = gl.createFramebuffer();
                gl.bindFramebuffer(gl.FRAMEBUFFER, tempFBO);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gpuTex.glTexture, 0);
                gl.colorMask(true, true, true, true);
                gl.disable(gl.SCISSOR_TEST);
                gl.readPixels(0, 0, this.renderData.width, this.renderData.height, gl.RGBA, gl.UNSIGNED_BYTE, destBuffer);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.deleteFramebuffer(tempFBO);
            } else {
                this.device.copyTextureToBuffers(colorTex, [destBuffer], this.regions);
            }
        }

        this.formatBuffer(
            this.renderData.buffer,
            this.needInvertGFXApi.includes(this.device.gfxAPI),
            this.device.gfxAPI === gfx.API.METAL,
        );

        this.emit('getData', this, this.data);
        return this.renderData;
    }

    static indexOfRGBA = [0, 1, 2, 3];
    static indexOfBGRA = [2, 1, 0, 3];

    formatBuffer(buffer: Uint8Array, needInvert: boolean, conversionBGRA: boolean) {
        if (!needInvert) { return buffer; }

        let startIndex, invertIndex;
        const V_U_Vec4 = { r: 0, g: 0, b: 0, a: 0 };

        const indexArr = conversionBGRA ? PreviewBuffer.indexOfBGRA : PreviewBuffer.indexOfRGBA;

        for (let w = 0; w < this.renderData.width; w++) {
            for (let h = 0; h < this.renderData.height / 2; h++) {
                startIndex = (h * this.renderData.width + w) * 4;
                invertIndex = ((this.renderData.height - 1 - h) * this.renderData.width + w) * 4;

                V_U_Vec4.r = buffer[startIndex + indexArr[0]];
                V_U_Vec4.g = buffer[startIndex + indexArr[1]];
                V_U_Vec4.b = buffer[startIndex + indexArr[2]];
                V_U_Vec4.a = buffer[startIndex + indexArr[3]];

                buffer[startIndex + 0] = buffer[invertIndex + indexArr[0]];
                buffer[startIndex + 1] = buffer[invertIndex + indexArr[1]];
                buffer[startIndex + 2] = buffer[invertIndex + indexArr[2]];
                buffer[startIndex + 3] = buffer[invertIndex + indexArr[3]];

                buffer[invertIndex + 0] = V_U_Vec4.r;
                buffer[invertIndex + 1] = V_U_Vec4.g;
                buffer[invertIndex + 2] = V_U_Vec4.b;
                buffer[invertIndex + 3] = V_U_Vec4.a;
            }
        }

        return buffer;
    }

    getImageDataInQueue(width: number, height: number): Promise<any> {
        return new Promise((resolve) => {
            const params = {
                width: Math.floor(width),
                height: Math.floor(height),
            };
            this.queue.push({ params, resolve });
            this.step();
        });
    }

    async step() {
        if (this.lock) {
            return;
        }
        this.lock = true;
        const item = this.queue.shift();
        if (!item) {
            this.lock = false;
            return;
        }
        const { params, resolve } = item;
        const data = await this.getImageData(params.width, params.height);
        resolve(data);
        this.lock = false;
        this.step();
    }

    async getImageData(width: number, height: number) {
        if (!this.renderScene) {
            return this.renderData;
        }

        this.ensureWindow(width, height);

        const root = this.renderScene.root;
        const currWindow = this.window;
        if (!currWindow) {
            return this.renderData;
        }

        let cameras: renderer.scene.Camera[] = [];
        if (root) {
            for (const window of root.windows) {
                if (window.cameras.length > 0 && window === currWindow) {
                    cameras = window.cameras;
                }
            }
        }

        if (!cameras.length) {
            return this.renderData;
        }

        const needResize = width && height && (width !== this.width || height !== this.height);
        if (needResize) {
            this.resize(width, height, currWindow);
        }

        for (let i = 0; i < cameras.length; i++) {
            const curWindowCamera = cameras[i];
            this.switchCameras(curWindowCamera, currWindow);
            if (curWindowCamera.width !== this.width || curWindowCamera.height !== this.height) {
                curWindowCamera.resize(width, height);
            }
            curWindowCamera.update(true);
        }

        const prevTempWindow = cc.director.root.tempWindow;
        cc.director.root.tempWindow = currWindow;
        Service.Engine.repaintInEditMode();

        return await new Promise((resolve) => {
            cc.director.once(cc.Director.EVENT_AFTER_DRAW, () => {
                cc.director.root.tempWindow = prevTempWindow;
                resolve(this.copyFrameBuffer(this.window));
            });
        });
    }
}

export default PreviewBuffer;
