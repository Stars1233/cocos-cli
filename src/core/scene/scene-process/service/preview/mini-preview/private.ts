import { CCObject, Node } from 'cc';

const DontSave = CCObject.Flags.DontSave;
const HideInHierarchy = CCObject.Flags.HideInHierarchy;

export function createPreviewNode(name: string): Node {
    const node = new Node(name);
    // @ts-ignore
    node.isPrivatePreview = true;
    node.objFlags |= DontSave | HideInHierarchy;
    return node;
}
