import {
    convertUserDataConfigItemToPropertySchema,
    convertUserDataConfigToPropertySchema,
    mergeUserDataConfigForPropertySchema,
} from '../property-schema';

describe('asset property schema conversion', () => {
    it('maps legacy userDataConfig controls to stable property schema fields', () => {
        const schema = convertUserDataConfigToPropertySchema({
            type: {
                label: 'Import Type',
                default: 'sprite-frame',
                render: {
                    ui: 'ui-select',
                    items: [
                        { label: 'Raw', value: 'raw' },
                        { label: 'Sprite Frame', value: 'sprite-frame' },
                    ],
                },
            },
            flipVertical: {
                label: 'Flip Vertical',
                render: {
                    ui: 'ui-checkbox',
                },
            },
            quality: {
                label: 'Quality',
                default: 80,
                render: {
                    ui: 'ui-number-input',
                    attributes: {
                        min: 0,
                        max: 100,
                        step: 1,
                    },
                },
            },
            image: {
                label: 'Image',
                default: '',
                render: {
                    ui: 'ui-asset',
                    attributes: {
                        assetType: 'cc.ImageAsset',
                    },
                },
            },
        });

        expect(schema.type).toMatchObject({
            label: 'Import Type',
            type: 'enum',
            default: 'sprite-frame',
            options: [
                { label: 'Raw', value: 'raw' },
                { label: 'Sprite Frame', value: 'sprite-frame' },
            ],
        });
        expect(schema.flipVertical.type).toBe('boolean');
        expect(schema.quality).toMatchObject({
            type: 'number',
            min: 0,
            max: 100,
            step: 1,
        });
        expect(schema.image).toMatchObject({
            type: 'asset',
            assetType: 'cc.ImageAsset',
        });
    });

    it('normalizes numeric enum option values when the default is numeric', () => {
        const schema = convertUserDataConfigItemToPropertySchema('meshType', {
            label: 'Mesh Type',
            default: 0,
            render: {
                ui: 'ui-select',
                items: [
                    { label: 'Rect', value: '0' },
                    { label: 'Polygon', value: '1' },
                ],
            },
        });

        expect(schema.type).toBe('enum');
        expect(schema.options).toEqual([
            { label: 'Rect', value: 0 },
            { label: 'Polygon', value: 1 },
        ]);
    });

    it('keeps nested object itemConfigs as nested properties', () => {
        const schema = convertUserDataConfigItemToPropertySchema('textureSetting', {
            label: 'Texture Setting',
            type: 'object',
            default: {
                anisotropy: 0,
            },
            itemConfigs: {
                anisotropy: {
                    label: 'Anisotropy',
                    default: 0,
                    render: {
                        ui: 'ui-number-input',
                        attributes: {
                            min: 0,
                            step: 1,
                        },
                    },
                },
            },
        });

        expect(schema).toMatchObject({
            label: 'Texture Setting',
            type: 'object',
            properties: {
                anisotropy: {
                    label: 'Anisotropy',
                    type: 'number',
                    default: 0,
                    min: 0,
                    step: 1,
                },
            },
        });
    });

    it('treats array-form itemConfigs as object properties when the parent is not an array', () => {
        const schema = convertUserDataConfigItemToPropertySchema('rect', {
            label: 'Rect',
            itemConfigs: [
                {
                    key: 'x',
                    label: 'X',
                    default: 0,
                    render: { ui: 'ui-number-input' },
                },
            ],
        });

        expect(schema).toMatchObject({
            label: 'Rect',
            type: 'object',
            properties: {
                x: {
                    label: 'X',
                    type: 'number',
                    default: 0,
                },
            },
        });
    });

    it('merges schema-only config for property schema without mutating runtime userDataConfig', () => {
        const runtimeConfig = {
            runtimeOnly: {
                label: 'Runtime Only',
                default: true,
                render: { ui: 'ui-checkbox' },
            },
        };
        const schemaOnlyConfig = {
            schemaOnly: {
                label: 'Schema Only',
                default: 1,
                render: { ui: 'ui-number-input' },
            },
        };

        const mergedConfig = mergeUserDataConfigForPropertySchema(runtimeConfig, schemaOnlyConfig);
        const schema = convertUserDataConfigToPropertySchema(mergedConfig);

        expect(schema).toMatchObject({
            runtimeOnly: {
                label: 'Runtime Only',
                type: 'boolean',
                default: true,
            },
            schemaOnly: {
                label: 'Schema Only',
                type: 'number',
                default: 1,
            },
        });
        expect(runtimeConfig).toHaveProperty('runtimeOnly');
        expect(runtimeConfig).not.toHaveProperty('schemaOnly');
    });
});
