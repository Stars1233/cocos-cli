import { assetManager } from '../../src/core/assets';
import * as Assets from '../../src/lib/assets/assets';

describe('lib assets api', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('does not expose saveAssetMeta from the public lib API', () => {
        expect((Assets as { saveAssetMeta?: unknown }).saveAssetMeta).toBeUndefined();
    });

    it('does not expose updateAssetMetaUserData from the public lib API', () => {
        expect((Assets as { updateAssetMetaUserData?: unknown }).updateAssetMetaUserData).toBeUndefined();
    });

    it('updateAssetUserData delegates sub asset uuid to assetManager', async () => {
        const result = { minfilter: 'nearest' };
        const spy = jest.spyOn(assetManager, 'updateUserData').mockResolvedValue(result);
        const updateAssetUserData = (Assets as {
            updateAssetUserData?: (
                urlOrUuidOrPath: string,
                path: string,
                value: unknown
            ) => Promise<unknown>;
        }).updateAssetUserData;

        expect(updateAssetUserData).toEqual(expect.any(Function));

        if (!updateAssetUserData) {
            throw new Error('updateAssetUserData is not exposed from lib/assets/assets');
        }

        await expect(updateAssetUserData('parent-uuid@6c48a', 'minfilter', 'nearest')).resolves.toBe(result);
        expect(spy).toHaveBeenCalledWith('parent-uuid@6c48a', 'minfilter', 'nearest');
    });

    it('exposes serializedData namespace and delegates query/save to assetManager', async () => {
        const result = {
            uuid: 'test-uuid',
            url: 'db://assets/test.pmtl',
            type: 'cc.PhysicsMaterial',
            importer: 'physics-material',
            dump: {},
        };
        const querySpy = jest.spyOn(assetManager, 'querySerializedData').mockResolvedValue(result);
        const saveSpy = jest.spyOn(assetManager, 'saveSerializedData').mockResolvedValue(result);

        expect(Assets.serializedData.query).toEqual(expect.any(Function));
        expect(Assets.serializedData.save).toEqual(expect.any(Function));

        await expect(Assets.serializedData.query('test-uuid')).resolves.toEqual(result);
        await expect(Assets.serializedData.save('test-uuid', {})).resolves.toEqual(result);
        expect(querySpy).toHaveBeenCalledWith('test-uuid');
        expect(saveSpy).toHaveBeenCalledWith('test-uuid', {});
    });

    it('exposes queryPropertySchema and delegates to assetManager', async () => {
        const schema = {
            type: {
                label: 'Import Type',
                type: 'enum' as const,
                default: 'sprite-frame',
            },
        };
        const spy = jest.spyOn(assetManager, 'queryPropertySchema').mockResolvedValue(schema);

        await expect(Assets.queryPropertySchema('image')).resolves.toEqual(schema);
        expect(spy).toHaveBeenCalledWith('image');
    });
});
