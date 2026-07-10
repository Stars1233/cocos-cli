import PreviewBuffer from './buffer';

class PreviewBase {
    protected previewBuffer!: PreviewBuffer;

    public async queryPreviewData(info: any) {
        const data = await this.previewBuffer.getImageData(info.width, info.height);
        return data;
    }

    public queryPreviewDataQueue(info: any): Promise<any> {
        return this.previewBuffer.getImageDataInQueue(info.width, info.height);
    }

    clearPreviewBuffer() {
        this.previewBuffer.clear();
    }

    public init(registerName: string, queryName: string) { }
}

export { PreviewBase };
