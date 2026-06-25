import { AssetHandlerBase } from '../../@types/protected';
import GltfHandler from './gltf';

export const FbxHandler: AssetHandlerBase = {
    ...GltfHandler,

    // Handler 的名字，用于指定 Handler as 等
    name: 'fbx',

    propertySchemaConfig: {
        ...(GltfHandler.propertySchemaConfig ?? {}),
        legacyFbxImporter: {
            label: 'Legacy FBX Importer',
            default: false,
            render: { ui: 'ui-checkbox' },
        },
        fbx: {
            label: 'FBX',
            type: 'object',
            default: {
                unitConversion: 'geometry-level',
                animationBakeRate: 24,
                preferLocalTimeSpan: true,
                smartMaterialEnabled: false,
                matchMeshNames: false,
            },
            itemConfigs: {
                unitConversion: {
                    label: 'Unit Conversion',
                    default: 'geometry-level',
                    render: {
                        ui: 'ui-select',
                        items: [
                            { label: 'Geometry Level', value: 'geometry-level' },
                            { label: 'Hierarchy Level', value: 'hierarchy-level' },
                            { label: 'Disabled', value: 'disabled' },
                        ],
                    },
                },
                animationBakeRate: {
                    label: 'Animation Bake Rate',
                    default: 24,
                    render: {
                        ui: 'ui-select',
                        items: [
                            { label: 'Original', value: '0' },
                            { label: '24 FPS', value: '24' },
                            { label: '25 FPS', value: '25' },
                            { label: '30 FPS', value: '30' },
                            { label: '60 FPS', value: '60' },
                        ],
                    },
                },
                preferLocalTimeSpan: {
                    label: 'Prefer Local Time Span',
                    default: true,
                    render: { ui: 'ui-checkbox' },
                },
                smartMaterialEnabled: {
                    label: 'Smart Material',
                    default: false,
                    render: { ui: 'ui-checkbox' },
                },
                matchMeshNames: {
                    label: 'Match Mesh Names',
                    default: false,
                    render: { ui: 'ui-checkbox' },
                },
            },
        },
    },
};

export default FbxHandler;
