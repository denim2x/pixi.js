import { Graphics } from '@pixi/graphics';
import { CanvasRenderer } from '@pixi/canvas-renderer';
import { RenderTexture, Texture, Formula } from '@pixi/core';
import { Matrix } from '@pixi/math';

import type { SCALE_MODES } from '@pixi/constants';
import type { BaseRenderTexture } from '@pixi/core';

let canvasRenderer: CanvasRenderer;
const tempMatrix = new Matrix();

export type IPaint = string|CanvasPattern;

interface _IStyle
{
    alpha?: number;
    paint?: IPaint;
    blendMode?: string;
}

type _IFill = _IStyle;

interface _IStroke extends _IStyle
{
    width?: number;
    cap?: string;
    join?: string;
    miterLimit?: number;

    clip?: boolean;
}

interface IStyle<S> extends S {
    use?: IStyle<S>[];
}

export type IStyles<S> = IStyle<S>|IStyle<S>[];

export type IFill = IStyle<_IFill>;
export type IStroke = IStyle<_IStroke>;

export type PaintFn<S, E = void> = (...styles: S[]) => E;
export type PaintRunner = (fill: PaintFn<IFill>, stroke: PaintFn<IStroke>) => unknown;

/**
 * Creates a new color tinter function.
 * The new function generates tinted color values, based on given `tint` value.
 *
 * @param {number} tint - The tint value
 * @return {(color: number) => number} The  new color tinter function
 */
export function Tinted(tint: number): (color: number) => number
{
    const tintR = ((tint >> 16) & 0xFF) / 255;
    const tintG = ((tint >> 8) & 0xFF) / 255;
    const tintB = (tint & 0xFF) / 255;

    return (color: number): number =>
    {
        const c = color | 0;

        return (
            (((c >> 16) & 0xFF) / 255 * tintR * 255 << 16)
            + (((c >> 8) & 0xFF) / 255 * tintG * 255 << 8)
            + (((c & 0xFF) / 255) * tintB * 255)
        );
    };
}

/**
 * Provides enhanced drawing onto given context by invoking given callback with `fill()` and `stroke()`.
 * These functions receive a variable argument list of `style` objects.
 * The final combined `style` becomes the new context state, then drawing follows.
 * Finally, the context is restored to the former state.
 *
 * @param {CanvasRenderingContext2D} context - The context to draw
 * @param {PIXI.PaintRunner} run - The callback to be invoked
 * @return {unknown} The value returned by `run()`
 */
export const Paint = Formula<PaintRunner>((context: CanvasRenderingContext2D) =>
{
    function resolve<S>(styles: IStyle<S>[], seen = new WeakSet<IStyle<S>>()): IStyle<S>[]
    {
        const res = [];

        for (const s of styles)
        {
            if (!seen.has(s))
            {
                seen.add(s);
                res.push(s);

                if (s.use)
                {
                    res.push(...resolve(s.use, seen));
                }
            }
        }

        return res;
    }

    function open<S>(styles: IStyles<S>, cb: (use: (prop: string) => unknown) => void): void
    {
        styles = [styles].flat();

        if (styles.length === 0)
        {
            cb(() => undefined);
        }
        else
        {
            styles = resolve(styles as IStyle<S>[]);

            const use = (prop: string): unknown =>
            {
                for (const s of styles)
                {
                    if (prop in s) return s[prop];
                }

                return undefined;
            };

            context.save();

            context.globalAlpha = use('alpha');
            context.globalCompositeOperation = use('blendMode');

            cb(use);

            context.restore();
        }
    }

    function fill(styles: IStyles<_IFill>): void
    {
        open(styles, (use: ((prop: string) => unknown)) =>
        {
            context.fillStyle = use('paint');

            context.fill();
        });
    }

    function stroke(styles: IStyles<_IStroke>): void
    {
        open(styles, (use: ((prop: string) => unknown)) =>
        {
            context.strokeStyle = use('paint');
            context.lineWidth = use('width');
            context.lineCap = use('cap');
            context.lineJoin = use('join');
            context.miterLimit = use('miterLimit');

            if (use('clip'))
            {
                context.clip();
            }

            context.stroke();
        });
    }

    return [fill, stroke];
});

/**
 * Generates a canvas texture. Only available with **pixi.js-legacy** bundle
 * or the **@pixi/canvas-graphics** package.
 * @method generateCanvasTexture
 * @memberof PIXI.Graphics#
 * @param {PIXI.SCALE_MODES} scaleMode - The scale mode of the texture.
 * @param {number} resolution - The resolution of the texture.
 * @return {PIXI.Texture} The new texture.
 */
Graphics.prototype.generateCanvasTexture = function generateCanvasTexture(scaleMode: SCALE_MODES, resolution = 1): Texture
{
    const bounds = this.getLocalBounds();

    const canvasBuffer = RenderTexture.create({
        width: bounds.width,
        height: bounds.height,
        scaleMode,
        resolution,
    });

    if (!canvasRenderer)
    {
        canvasRenderer = new CanvasRenderer();
    }

    this.transform.updateLocalTransform();
    this.transform.localTransform.copyTo(tempMatrix);

    tempMatrix.invert();

    tempMatrix.tx -= bounds.x;
    tempMatrix.ty -= bounds.y;

    canvasRenderer.render(this, canvasBuffer, true, tempMatrix);

    const texture = Texture.from((canvasBuffer.baseTexture as BaseRenderTexture)._canvasRenderTarget.canvas, {
        scaleMode,
    });

    texture.baseTexture.setResolution(resolution);

    return texture;
};

Graphics.prototype.cachedGraphicsData = [];

/**
 * Renders the object using the Canvas renderer
 *
 * @method _renderCanvas
 * @memberof PIXI.Graphics#
 * @private
 * @param {PIXI.CanvasRenderer} renderer - The renderer
 */
Graphics.prototype._renderCanvas = function _renderCanvas(renderer: CanvasRenderer): void
{
    if (this.isMask === true)
    {
        return;
    }

    this.finishPoly();
    renderer.plugins.graphics.render(this);
};
