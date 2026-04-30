'use strict';

import { Color, Node, Size, UITransform, Vec2, Vec3 } from 'cc';
import { getNodeWorldBounds } from './node-utils';

declare const cc: any;

interface IWorldRect {
    minPos: Vec3;
    maxPos: Vec3;
    center: Vec3;
    width: number;
    height: number;
}

interface IDistanceInfo {
    left: IRectDistInfo[]; // 记录元素左边与其它元素的所有距离
    right: IRectDistInfo[]; // 记录元素右边与其它元素的所有距离
    top: IRectDistInfo[]; // 记录元素上边与其它元素的所有距离
    bottom: IRectDistInfo[]; // 记录元素下边与其它元素的所有距离
}

interface IShapeInfo {
    worldRect: IWorldRect;
    distInfo: IDistanceInfo;
}

interface IRectDistInfo {
    minDist: number;
    minDistPosA: Vec3;
    minDistPosB: Vec3;
    axis: string;
    targetShapeInfo?: IShapeInfo;
}

interface IRectSnapConfigData {
    enableSnapping: boolean;
    snapThreshold: number;
}

class SnapGuideline {
    value;
    lineVertices: Vec3[] = [];
    axis: keyof(Vec3);
    checkNode?: Node;

    constructor(value: number, axis: keyof(Vec3), vertices: Vec3[]) {
        this.value = value;
        this.axis = axis;
        this.lineVertices = vertices;
    }
}

class SnapGuidelineGroup {
    currentGuidelines: SnapGuideline[] = [];
    guidelines: Map<number, SnapGuideline[]> = new Map();

    clear() {
        this.guidelines.clear();
    }

    addGuideline(guideline: SnapGuideline) {
        let guidelineArray: SnapGuideline[] = [];
        if (!this.guidelines.has(guideline.value)) {
            this.guidelines.set(guideline.value, guidelineArray);
        } else {
            guidelineArray = this.guidelines.get(guideline.value)!;
        }

        guidelineArray.push(guideline);
    }

    snapToGuidelines(value: number, snapDist: number) {
        const keys: IterableIterator<number> = this.guidelines.keys();
        if (this.guidelines.size <= 0) {
            return value;
        }

        let closestDist = Number.MAX_VALUE;
        let snapKey;
        for (const key of keys) {
            const dist = Math.abs(value - key);
            if (dist < closestDist) {
                snapKey = key;
                closestDist = dist;
            }
        }

        if (snapKey !== undefined && closestDist <= snapDist) {
            value = snapKey;
            this.currentGuidelines = this.currentGuidelines.concat(this.guidelines.get(snapKey)!);
        }

        return value;
    }
}

class RectTransformSnapping implements IRectSnapConfigData {
    enableSnapping = true; // 开启智能对齐(和其它节点对齐，相对间距对齐，画布对齐)
    enableGridSnapping = true; // 开启网格对齐
    snapThreshold = 4; // 吸附检测阈值
    // node snapping
    nodeSnapGuidelineGroups = [new SnapGuidelineGroup(), new SnapGuidelineGroup()];
    sidesAndMiddle = [0, 0.5, 1];
    guidelineColor = new Color(255, 71, 0); // 通用参考线颜色

    // canvas
    canvasSnapColor = new Color(255, 190, 75); // 和Canvas对齐的参考线颜色
    canvasSnapGuidelineGroups = [new SnapGuidelineGroup(), new SnapGuidelineGroup()];

    // equal spacing
    shapeInfos: IShapeInfo[] = []; // 节点的形状信息
    currentMatchMinDistInfos: IRectDistInfo[] = []; // 满足条件的距离信息

    // grid
    gridSpacingX = 100;
    gridSpacingY = 100;
    gridColor = Color.GRAY; // 网格颜色
    gridSnapGuidelineGroups = [new SnapGuidelineGroup(), new SnapGuidelineGroup()];

    public getPureDataObject(): IRectSnapConfigData {
        return {
            enableSnapping: this.enableSnapping,
            snapThreshold: this.snapThreshold,
        };
    }

    public initFromData(data: IRectSnapConfigData) {
        this.enableSnapping = data.enableSnapping;
        this.snapThreshold = data.snapThreshold;
    }

    lerp(from: number, to: number, ratio: number) {
        return from + (to - from) * ratio;
    }

    getWorldRectEx(node: Node): IWorldRect {
        const bounds = getNodeWorldBounds(node);

        const minPos = new Vec3(bounds.x, bounds.y, 0);
        const maxPos = new Vec3(bounds.x + bounds.width, bounds.y + bounds.height, 0);
        const center = new Vec3(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, 0);
        return {
            minPos,
            maxPos,
            center,
            width: bounds.width,
            height: bounds.height,
        };
    }

    snapToGuidelinesOnAxis(guidelineGroups: SnapGuidelineGroup[], value: number, snapDist: number, axis: string) {
        const guidelineGroup = (axis === 'x' ? guidelineGroups[0] : guidelineGroups[1]);

        return guidelineGroup.snapToGuidelines(value, snapDist);
    }

    getNodeGuidelinePos(node: Node, axis: keyof(Vec3), side: number) {
        const linePoints: Vec3[] = [new Vec3(), new Vec3()];

        let crossAxis: keyof(Vec3) = 'x';
        if (axis === 'x') {
            crossAxis = 'y';
        } else if (axis === 'y') {
            crossAxis = 'x';
        }

        const rect = this.getWorldRectEx(node);
        const minPos = rect.minPos;
        const maxPos = rect.maxPos;

        // 设置线段的两个端点不相等的那个坐标的值
        linePoints[0][crossAxis] = minPos[crossAxis];
        linePoints[1][crossAxis] = maxPos[crossAxis];

        // 设置线段相等的那个坐标的值
        // @ts-ignore
        linePoints[0][axis] = this.lerp(minPos[axis], maxPos[axis], side);
        // @ts-ignore
        linePoints[1][axis] = linePoints[0][axis];

        return linePoints;
    }

    // side: 0->min, 1->middle, 2-> max
    getNodeSnapGuidelines(parentNode: Node, node: Node, axis: keyof(Vec3), side: number) {
        const guidelines: SnapGuideline[] = [];

        if (parentNode) {
            // snap to siblings
            parentNode.children.forEach((child) => {
                if (child === node) {
                    return;
                }

                // 不处理size为0的情况
                const contentSize = child.getComponent(UITransform)?.contentSize;
                if (!contentSize || contentSize.width <= 0 || contentSize.height <= 0) {
                    return;
                }

                if (side === 0) {
                    // snap min to min side
                    guidelines.push(new SnapGuideline(this.getWorldRectEx(child).minPos[axis] as number, axis, this.getNodeGuidelinePos(child, axis, 0)));

                    // snap min to max side
                    guidelines.push(new SnapGuideline(this.getWorldRectEx(child).maxPos[axis] as number, axis, this.getNodeGuidelinePos(child, axis, 1)));
                } else if (side === 1) {
                    guidelines.push(new SnapGuideline(this.getWorldRectEx(child).center[axis] as number, axis, this.getNodeGuidelinePos(child, axis, 0.5)));
                } else if (side === 2) {
                    // snap max to max side
                    guidelines.push(new SnapGuideline(this.getWorldRectEx(child).maxPos[axis] as number, axis, this.getNodeGuidelinePos(child, axis, 1)));

                    // snap max to min side
                    guidelines.push(new SnapGuideline(this.getWorldRectEx(child).minPos[axis] as number, axis, this.getNodeGuidelinePos(child, axis, 0)));
                }
            });
        }

        return guidelines;
    }

    clearCurrentNodeGuidelines() {
        this.nodeSnapGuidelineGroups[0].currentGuidelines = [];
        this.nodeSnapGuidelineGroups[1].currentGuidelines = [];
    }

    //#region snap to other nodes

    snapToNodeGuidelinesOnAxis(value: number, snapDist: number, axis: string) {
        return this.snapToGuidelinesOnAxis(this.nodeSnapGuidelineGroups, value, snapDist, axis);
    }

    snapPosToNodeGuidelines(worldPos: Vec3, worldSize: Size, snapDist: Vec2) {
        this.clearCurrentNodeGuidelines();
        const halfWidth = worldSize.width / 2;
        const halfHeight = worldSize.height / 2;

        // 先对齐边，再对齐中心点
        const newPos = worldPos.clone();
        // side
        newPos.x = this.snapToNodeGuidelinesOnAxis(newPos.x - halfWidth, snapDist.x, 'x') + halfWidth;
        newPos.x = this.snapToNodeGuidelinesOnAxis(newPos.x + halfWidth, snapDist.x, 'x') - halfWidth;
        newPos.y = this.snapToNodeGuidelinesOnAxis(newPos.y - halfHeight, snapDist.y, 'y') + halfHeight;
        newPos.y = this.snapToNodeGuidelinesOnAxis(newPos.y + halfHeight, snapDist.y, 'y') - halfHeight;

        // center
        newPos.x = this.snapToNodeGuidelinesOnAxis(newPos.x, snapDist.x, 'x');
        newPos.y = this.snapToNodeGuidelinesOnAxis(newPos.y, snapDist.y, 'y');

        return newPos;
    }

    snapSizeToNodeGuidelines(oriSizePos: Vec2, deltaSize: Vec2, snapDist: Vec2) {
        this.clearCurrentNodeGuidelines();
        if (deltaSize.x !== 0) {
            deltaSize.x = this.snapToNodeGuidelinesOnAxis(oriSizePos.x + deltaSize.x, snapDist.x, 'x') - oriSizePos.x;
        }

        if (deltaSize.y !== 0) {
            deltaSize.y = this.snapToNodeGuidelinesOnAxis(oriSizePos.y + deltaSize.y, snapDist.y, 'y') - oriSizePos.y;
        }

        return deltaSize;
    }

    calculateNodeSnapGuidelines(parentNode: Node, node: Node) {
        for (let i = 0; i < 2; i++) {
            this.nodeSnapGuidelineGroups[i].clear();
        }

        if (!parentNode) {
            return;
        }

        let guidelines = [];
        const axisName: (keyof(Vec3))[] = ['x', 'y'];
        for (let axis = 0; axis < 2; axis++) {
            for (let side = 0; side < this.sidesAndMiddle.length; side++) {
                guidelines = this.getNodeSnapGuidelines(parentNode, node, axisName[axis], side);
                guidelines.forEach((guideline) => {
                    guideline.checkNode = node;
                    this.nodeSnapGuidelineGroups[axis].addGuideline(guideline);
                });
            }
        }
    }

    // #endregion snap to other nodes

    generateWorldRect(worldPos: Vec3, worldSize: Size) {
        const halfWidth = worldSize.width / 2;
        const halfHeight = worldSize.height / 2;
        return {
            minPos: new Vec3(worldPos.x - halfWidth, worldPos.y - halfHeight, worldPos.z),
            maxPos: new Vec3(worldPos.x + halfWidth, worldPos.y + halfHeight, worldPos.z),
            center: worldPos,
            width: worldSize.width,
            height: worldSize.height,
        };
    }

    //#region snap to equal spacing

    checkEqualSpacingOnSide(checkDistInfo: IDistanceInfo, side: keyof(IDistanceInfo), snapValue: number) {
        const sideDistInfos = checkDistInfo[side];
        if (!sideDistInfos || sideDistInfos.length <= 0) {
            return null;
        }

        const matchSideDistInfos: IRectDistInfo[] = [];

        const sideMinDistInfo = sideDistInfos[0];
        const checkDist = sideMinDistInfo.minDist;
        const sideTarget = sideMinDistInfo.targetShapeInfo;
        const sideDistArrayOfSideTarget = sideTarget?.distInfo[side];
        let matchDist = -1;
        let deltaDist = 0;
        let matchDeltaDist = 0;
        if (sideDistArrayOfSideTarget && sideDistArrayOfSideTarget.length > 0) {
            sideDistArrayOfSideTarget.forEach((info) => {
                deltaDist = info.minDist - checkDist;
                if (Math.abs(deltaDist) <= snapValue) {
                    matchDeltaDist = deltaDist;
                    matchDist = info.minDist;
                    matchSideDistInfos.push(info);
                }
            });
        }

        if (matchDist > 0) {
            // 检测右边和下边时，需要变换符号，才能正确更新位置
            if (side === 'right' || side === 'top') {
                matchDeltaDist = -matchDeltaDist;
            }
            return {
                matchDist,
                matchDeltaDist,
                sideMinDistShapeInfo: sideTarget, // 和检测节点最近的元素数据
                matchSideDistInfos, // 这里存的是下一级的距离数据，和检测节点最近的那个没有存储在这里，因为snap后要重新算一下位置
            };
        }
    }

    checkEqualSpacingOnAxis(distInfo: IDistanceInfo, value: number, axis: keyof(Vec3), snapValue: number) {
        let matchDistInfos: IRectDistInfo[] = [];
        const matchShapeInfos: any[] = [];
        let sides: (keyof(IDistanceInfo))[] = [];
        if (axis === 'x') {
            sides = ['left', 'right'];
        } else if (axis === 'y') {
            sides = ['top', 'bottom'];
        }

        let isHit = false;
        let newValue = 0;
        sides.forEach((side) => {
            const checkResult = this.checkEqualSpacingOnSide(distInfo, side, snapValue);
            if (checkResult) {
                isHit = true;
                newValue = value + checkResult.matchDeltaDist;
                // 暂时只支持单边
                matchDistInfos = checkResult.matchSideDistInfos;
                matchShapeInfos.push(checkResult.sideMinDistShapeInfo);
            }
        });

        if (!isHit) {
            const sideA = distInfo[sides[0]];
            const sideB = distInfo[sides[1]];
            const sideMinDistInfoA = sideA[0];
            const sideMinDistInfoB = sideB[0];
            if (sideMinDistInfoA && sideMinDistInfoB) {
                // 暂时只处理anchor在中心点的情况
                const middlePosOnAxis = ((sideMinDistInfoA.minDistPosA[axis] as number) + (sideMinDistInfoB.minDistPosB[axis] as number)) / 2;
                const posDiff = Math.abs(value - middlePosOnAxis);
                if (posDiff <= snapValue) {
                    newValue = middlePosOnAxis;
                    isHit = true;
                    matchShapeInfos.push(sideMinDistInfoA.targetShapeInfo, sideMinDistInfoB.targetShapeInfo);
                }
            }
        }

        if (isHit) {
            return {
                newValue,
                matchDistInfos,
                matchShapeInfos,
            };
        }

        return null;
    }

    snapPosToEqualSpacing(worldPos: Vec3, worldSize: Size, snapDist: Vec2) {
        this.currentMatchMinDistInfos = [];

        const checkWorldRect = this.generateWorldRect(worldPos, worldSize);
        const checkShapeInfo = this.generateShapeInfo(checkWorldRect);
        for (let i = 0; i < this.shapeInfos.length; i++) {
            const info = this.shapeInfos[i];
            const { distInfoA } = this.gatherDistInfo(checkShapeInfo, info);
            this.concatDistInfo(checkShapeInfo.distInfo, distInfoA);
        }

        const newPos = worldPos.clone();

        const distInfo = checkShapeInfo.distInfo;
        function sortByDist(a: IRectDistInfo, b: IRectDistInfo) {
            return a.minDist - b.minDist;
        }

        const matchShapeInfos: any[] = []; // 和当前检测节点满足节点的元素，为了最后再算一下距离位置
        const left = distInfo.left;
        const right = distInfo.right;
        const top = distInfo.top;
        const bottom = distInfo.bottom;
        // check x equal spacing
        if (left.length > 0 || right.length > 0) {
            left.sort(sortByDist);
            right.sort(sortByDist);

            const checkResult = this.checkEqualSpacingOnAxis(distInfo, newPos.x, 'x', snapDist.x);
            if (checkResult) {
                newPos.x = checkResult.newValue;
                this.currentMatchMinDistInfos.push(...checkResult.matchDistInfos);
                matchShapeInfos.push(...checkResult.matchShapeInfos);
            }
        }

        // check y equal spacing
        if (top.length > 0 && bottom.length > 0) {
            top.sort(sortByDist);
            bottom.sort(sortByDist);
            const checkResult = this.checkEqualSpacingOnAxis(distInfo, newPos.y, 'y', snapDist.y);
            if (checkResult) {
                newPos.y = checkResult.newValue;
                this.currentMatchMinDistInfos.push(...checkResult.matchDistInfos);
                matchShapeInfos.push(...checkResult.matchShapeInfos);
            }
        }

        const newCheckWorldRect = this.generateWorldRect(newPos, worldSize);
        matchShapeInfos.forEach((shapeInfo) => {
            if (!shapeInfo) {
                return;
            }
            const distInfoResult = this.getDistInfoOfRect(newCheckWorldRect, shapeInfo.worldRect);
            if (distInfoResult) {
                this.currentMatchMinDistInfos.push(distInfoResult);
            }
        });

        return newPos;
    }

    calculateSpacingSnapGuidelines(parentNode: Node, node: Node) {
        const shapeInfos = this.gatherShapeInfos(parentNode, node);

        if (!shapeInfos) {
            return;
        }

        for (let i = 0; i < shapeInfos.length - 1; i++) {
            const infoA = shapeInfos[i];
            for (let j = i; j < shapeInfos.length; j++) {
                const infoB = shapeInfos[j];
                const { distInfoA, distInfoB } = this.gatherDistInfo(infoA, infoB);
                this.concatDistInfo(infoA.distInfo, distInfoA);
                this.concatDistInfo(infoB.distInfo, distInfoB);
            }
        }

        this.shapeInfos = shapeInfos;
    }

    gatherDistInfo(infoA: IShapeInfo, infoB: IShapeInfo) {
        const rectA = infoA.worldRect;
        const rectB = infoB.worldRect;
        const distInfoA: IDistanceInfo = {
            left: [],
            right: [],
            top: [],
            bottom: [],
        };

        const distInfoB: IDistanceInfo = {
            left: [],
            right: [],
            top: [],
            bottom: [],
        };

        const distInfo = this.getDistInfoOfRect(rectA, rectB);
        if (distInfo) {
            const distToBInfo = Object.assign({ targetShapeInfo: infoB }, distInfo);
            const distToAInfo = Object.assign({ targetShapeInfo: infoA }, distInfo);
            if (distInfo.axis === 'x') {
                if (rectA.center.x > rectB.center.x) {
                    distInfoA.left.push(distToBInfo);
                    distInfoB.right.push(distToAInfo);
                } else {
                    distInfoA.right.push(distToBInfo);
                    distInfoB.left.push(distToAInfo);
                }
            } else if (distInfo.axis === 'y') {
                if (rectA.center.y > rectB.center.y) {
                    distInfoA.bottom.push(distToBInfo);
                    distInfoB.top.push(distToAInfo);
                } else {
                    distInfoA.top.push(distToBInfo);
                    distInfoB.bottom.push(distToAInfo);
                }
            }
        }

        return {
            distInfoA,
            distInfoB,
        };
    }

    concatDistInfo(dstDistInfo: IDistanceInfo, srcDistInfo: IDistanceInfo) {
        dstDistInfo.left = dstDistInfo.left.concat(srcDistInfo.left);
        dstDistInfo.right = dstDistInfo.right.concat(srcDistInfo.right);
        dstDistInfo.top = dstDistInfo.top.concat(srcDistInfo.top);
        dstDistInfo.bottom = dstDistInfo.bottom.concat(srcDistInfo.bottom);
    }

    gatherShapeInfos(parentNode: Node, node: Node) {
        const shapeInfos: IShapeInfo[] = [];
        if (!parentNode) {
            return null;
        }

        parentNode.children.forEach((child) => {
            if (child === node) {
                return;
            }

            // 不处理size为0的情况
            const contentSize = child.getComponent(UITransform)?.contentSize;
            if (!contentSize || contentSize.width <= 0 || contentSize.height <= 0) {
                return;
            }

            const worldRect = this.getWorldRectEx(child);
            shapeInfos.push(
                this.generateShapeInfo(worldRect),
            );
        });

        return shapeInfos;
    }

    generateShapeInfo(worldRect: IWorldRect): IShapeInfo {
        return {
            worldRect,
            distInfo: {
                left: [],
                right: [],
                top: [],
                bottom: [],
            },
        };
    }

    getDistInfoOfRect(rectA: IWorldRect, rectB: IWorldRect): IRectDistInfo | null {
        let minDist = -1;
        let minDistPosA;
        let minDistPosB;
        let axis = 'x';

        const centerA = rectA.center;
        const centerB = rectB.center;

        const dx = Math.abs(centerA.x - centerB.x);
        const dy = Math.abs(centerA.y - centerB.y);

        function compareNumber(a: number, b: number) {
            return a - b;
        }

        // 两个矩形不相交，在X坐标上有重叠，最短距离为上矩形的下边和下面形的上边的距离
        if ((dx < ((rectA.width + rectB.width) / 2)) && (dy >= ((rectA.height + rectB.height) / 2))) {
            minDist = dy - ((rectA.height + rectB.height) / 2);

            let upRect = rectA;
            let downRect = rectB;
            if (centerA.y < centerB.y) {
                upRect = rectB;
                downRect = rectA;
            }

            // 找重叠X坐标
            const xSides = [upRect.minPos.x, upRect.minPos.x + upRect.width, downRect.maxPos.x, downRect.maxPos.x - downRect.width];
            xSides.sort(compareNumber);

            const middleX = (xSides[1] + xSides[2]) / 2;
            minDistPosA = new Vec3(middleX, upRect.minPos.y, 0);
            minDistPosB = new Vec3(middleX, downRect.maxPos.y, 0);
            axis = 'y';
        } else if ((dx >= ((rectA.width + rectB.width) / 2)) && (dy < ((rectA.height + rectB.height) / 2))) {
            // 两个矩形不相交，在Y坐标上有重叠，最短距离为左矩形的右边和右矩形的左边的距离
            minDist = dx - ((rectA.width + rectB.width) / 2);

            let leftRect = rectA;
            let rightRect = rectB;
            if (centerA.x > centerB.x) {
                leftRect = rectB;
                rightRect = rectA;
            }

            // 找重叠Y坐标
            const ySides = [leftRect.maxPos.y, leftRect.maxPos.y - leftRect.height, rightRect.minPos.y, rightRect.minPos.y + rightRect.height];
            ySides.sort(compareNumber);

            const middleY = (ySides[1] + ySides[2]) / 2;
            minDistPosA = new Vec3(leftRect.maxPos.x, middleY, 0);
            minDistPosB = new Vec3(rightRect.minPos.x, middleY, 0);
            axis = 'x';
        }

        if (minDist > 0) {
            // minDistPos为从左到右，或从上到下的线段的两个端点
            return {
                minDist,
                minDistPosA: minDistPosA!,
                minDistPosB: minDistPosB!,
                axis,
            };
        } else {
            return null;
        }
    }

    //#endregion snap to equal spacing

    //#region grid snapping
    calculateGridSnapGuidelines() {
        const size = (cc as any).engine.getDesignResolutionSize();
        // x
        for (let i = 0; i < size.width; i += this.gridSpacingX) {
            const lineStartPos = new Vec2(i, 0);
            const lineEndPos = new Vec2(i, size.height);
            const xGuideline = new SnapGuideline(i, 'x', [lineStartPos as any, lineEndPos as any]);
            this.gridSnapGuidelineGroups[0].addGuideline(xGuideline);
        }

        // y
        for (let i = 0; i < size.height; i += this.gridSpacingY) {
            const lineStartPos = new Vec2(0, i);
            const lineEndPos = new Vec2(size.width, i);
            const yGuideline = new SnapGuideline(i, 'y', [lineStartPos as any, lineEndPos as any]);
            this.gridSnapGuidelineGroups[1].addGuideline(yGuideline);
        }
    }

    clearCurrentGridGuidelines() {
        this.gridSnapGuidelineGroups[0].currentGuidelines = [];
        this.gridSnapGuidelineGroups[1].currentGuidelines = [];
    }

    snapToGridGuidelinesOnAxis(value: number, snapDist: number, axis: keyof(Vec3)) {
        return this.snapToGuidelinesOnAxis(this.gridSnapGuidelineGroups, value, snapDist, axis);
    }

    snapPosToGridSnapGuidelines(worldPos: Vec3, worldSize: Size, snapDist: Vec2) {
        this.clearCurrentGridGuidelines();
        const halfWidth = worldSize.width / 2;
        const halfHeight = worldSize.height / 2;

        // 只对齐边
        const newPos = worldPos.clone();
        // side
        newPos.x = this.snapToGridGuidelinesOnAxis(newPos.x - halfWidth, snapDist.x, 'x') + halfWidth;
        newPos.x = this.snapToGridGuidelinesOnAxis(newPos.x + halfWidth, snapDist.x, 'x') - halfWidth;
        newPos.y = this.snapToGridGuidelinesOnAxis(newPos.y - halfHeight, snapDist.y, 'y') + halfHeight;
        newPos.y = this.snapToGridGuidelinesOnAxis(newPos.y + halfHeight, snapDist.y, 'y') - halfHeight;

        return newPos;
    }

    snapSizeToGridGuidelines(oriSizePos: Vec3, deltaSize: Vec3, snapDist: Vec2) {
        this.clearCurrentGridGuidelines();
        if (deltaSize.x !== 0) {
            deltaSize.x = this.snapToGridGuidelinesOnAxis(oriSizePos.x + deltaSize.x, snapDist.x, 'x') - oriSizePos.x;
        }

        if (deltaSize.y !== 0) {
            deltaSize.y = this.snapToGridGuidelinesOnAxis(oriSizePos.y + deltaSize.y, snapDist.y, 'y') - oriSizePos.y;
        }

        return deltaSize;
    }

    //#endregion grid snapping

    //#region canvas snapping
    calculateCanvasSnapGuidelines() {
        const size = (cc as any).view.getDesignResolutionSize();
        const left = 0;
        const middleX = size.width / 2;
        const right = size.width;
        const bottom = 0;
        const middleY = size.height / 2;
        const top = size.height;

        // x
        const xAxis = [left, middleX, right];
        xAxis.forEach((x) => {
            this.canvasSnapGuidelineGroups[0].addGuideline(new SnapGuideline(x, 'x',
                [new Vec3(x, 0), new Vec3(x, size.height)]));
        });

        // y
        const yAxis = [bottom, middleY, top];
        yAxis.forEach((y) => {
            this.canvasSnapGuidelineGroups[1].addGuideline(new SnapGuideline(y, 'x',
                [new Vec3(0, y), new Vec3(size.width, y)]));
        });
    }

    clearCurrentCanvasGuidelines() {
        this.canvasSnapGuidelineGroups[0].currentGuidelines = [];
        this.canvasSnapGuidelineGroups[1].currentGuidelines = [];
    }

    snapToCanvasSnapGuidelinesOnAxis(value: number, snapDist: number, axis: string) {
        return this.snapToGuidelinesOnAxis(this.canvasSnapGuidelineGroups, value, snapDist, axis);
    }

    snapPosToCanvasSnapGuidelines(worldPos: Vec3, worldSize: Size, snapDist: Vec2) {
        this.clearCurrentCanvasGuidelines();
        const halfWidth = worldSize.width / 2;
        const halfHeight = worldSize.height / 2;

        // 先对齐边，再对齐中心点
        const newPos = worldPos.clone();
        // side
        newPos.x = this.snapToCanvasSnapGuidelinesOnAxis(newPos.x - halfWidth, snapDist.x, 'x') + halfWidth;
        newPos.x = this.snapToCanvasSnapGuidelinesOnAxis(newPos.x + halfWidth, snapDist.x, 'x') - halfWidth;
        newPos.y = this.snapToCanvasSnapGuidelinesOnAxis(newPos.y - halfHeight, snapDist.y, 'y') + halfHeight;
        newPos.y = this.snapToCanvasSnapGuidelinesOnAxis(newPos.y + halfHeight, snapDist.y, 'y') - halfHeight;

        // center
        newPos.x = this.snapToCanvasSnapGuidelinesOnAxis(newPos.x, snapDist.x, 'x');
        newPos.y = this.snapToCanvasSnapGuidelinesOnAxis(newPos.y, snapDist.y, 'y');

        return newPos;
    }

    //#endregion canvas snapping
}

const rectTransformSnapping = new RectTransformSnapping();

export {
    SnapGuideline,
    SnapGuidelineGroup,
    RectTransformSnapping,
    IRectSnapConfigData,
    rectTransformSnapping,
};
