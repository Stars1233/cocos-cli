'use strict';

import { Color, MeshRenderer, Node, Vec3 } from 'cc';

import ControllerBase from './base';
import ControllerUtils from '../utils/controller-utils';
import controllerShape from '../utils/controller-shape';
import {
    getModel,
    updatePositions,
    updateIB,
    updateVBAttr,
    setMeshColor,
    setNodeOpacity,
} from '../utils/engine-utils';

class LinesController extends ControllerBase {
    private _linesNode: Node | null = null;
    private _linesMR: MeshRenderer | null = null;
    private _dashed = false;

    constructor(rootNode: Node, opts: any = {}) {
        super(rootNode);
        this.initShape(opts);
    }

    initShape(opts: any = {}) {
        this.createShapeNode('LinesController');
        this._dashed = opts.dashed ?? false;

        const vertices: Vec3[] = [new Vec3(), new Vec3()];
        const indices: number[] = [0, 1];
        const linesData = controllerShape.calcLinesData(vertices, indices, false);
        this._linesNode = ControllerUtils.createShapeByData(linesData, this._color, { unlit: true, dashed: this._dashed });
        this._linesNode.name = 'LinesNode';
        this._linesNode.parent = this.shape;
        this._linesMR = getModel(this._linesNode);
    }

    setColor(color: Color) {
        this._color = color;
        setMeshColor(this._linesNode!, color);
    }

    setOpacity(opacity: number) {
        setNodeOpacity(this._linesNode!, opacity);
    }

    updateData(vertices: Vec3[], indices: number[]) {
        const linesData = controllerShape.calcLinesData(vertices, indices, false);

        if (this._dashed) {
            const lineDistances: number[] = [];
            if (vertices.length > 0 && indices.length > 0) {
                lineDistances[0] = 0;
                const v0 = vertices[indices[0]];
                for (let i = 1; i < indices.length; i++) {
                    const v = vertices[indices[i]];
                    lineDistances[i] = Vec3.distance(v, v0);
                }
            }

            updateVBAttr(this._linesMR!, 'a_lineDistance', lineDistances);
        }

        updatePositions(this._linesMR!, linesData.positions);
        updateIB(this._linesMR!, linesData.indices!);
    }

    clearData() {
        updatePositions(this._linesMR!, []);
        updateIB(this._linesMR!, []);
    }
}

export default LinesController;
