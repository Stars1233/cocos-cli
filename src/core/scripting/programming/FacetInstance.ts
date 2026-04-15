import ps, { join } from 'path';
import { ProgrammingFacet } from './Facet';


let programmingFacet: ProgrammingFacet | null;

export async function createProgrammingFacet(enginePath: string, projectPath: string, features: string[]) {
    if (!programmingFacet) {
        programmingFacet = await ProgrammingFacet.create(
            {
                root: enginePath,
                distRoot: join(enginePath, 'bin', '.cache', 'dev-cli', 'web'),
                baseUrl: '/scripting/engine',
                features,
            },
            projectPath
        );
    }
    return programmingFacet;
}

export function getPreviewFacet() {
    if (!programmingFacet) {
        throw new Error('ProgrammingFacet not init, please init firstly.');
    }
    return programmingFacet;
}
