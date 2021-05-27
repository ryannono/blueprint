/*
 * Copyright 2021 Palantir Technologies, Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import classNames from "classnames";
import * as React from "react";

import {
    Classes as CoreClasses,
    IOverlayLifecycleProps,
    Portal,
    Props,
    Utils as CoreUtils,
    mergeRefs,
} from "@blueprintjs/core";

import * as Classes from "./classes";
import { Popover2Props, Popover2 } from "./popover2";
import { Popover2TargetProps } from "./popover2SharedProps";

type Offset = {
    left: number;
    top: number;
};

/**
 * Render props relevant to the _content_ of a context menu (rendered as the underlying Popover's content).
 */
export interface ContextMenu2ContentProps {
    /** Whether the context menu is currently open. */
    isOpen: boolean;

    /**
     * The computed target offset (x, y) coordinates for the context menu click event.
     * On first render, before any context menu click event has occurred, this will be undefined.
     */
    targetOffset: Offset | undefined;

    /** The context menu click event. If isOpen is false, this will be undefined. */
    mouseEvent: React.MouseEvent<HTMLElement> | undefined;
}

/** @deprecated use ContextMenu2ContentProps */
export type ContextMenu2RenderProps = ContextMenu2ContentProps;

/**
 * Render props for advanced usage of ContextMenu.
 */
export interface ContextMenu2ChildrenProps {
    /** Context menu container element class */
    className: string;

    /** Render props relevant to the content of this context menu */
    contentProps: ContextMenu2ContentProps;

    /** Context menu handler which implements the custom context menu interaction */
    onContextMenu: React.MouseEventHandler<HTMLElement>;

    /** Popover element rendered by ContextMenu, used to establish a click target to position the menu */
    popover: JSX.Element | undefined;
}

export interface ContextMenu2Props
    extends Omit<React.HTMLAttributes<HTMLElement>, "children" | "className" | "onContextMenu">,
        React.RefAttributes<any>,
        Props {
    /**
     * Menu content. This will usually be a Blueprint `<Menu>` component.
     * This optionally functions as a render prop so you can use component state to render content.
     */
    content: JSX.Element | ((props: ContextMenu2ContentProps) => JSX.Element | undefined) | undefined;

    /**
     * The context menu target. This may optionally be a render function so you can use
     * component state to render the target.
     */
    children: React.ReactNode | ((props: ContextMenu2ChildrenProps) => React.ReactElement);

    /**
     * Whether the context menu is disabled.
     *
     * @default false
     */
    disabled?: boolean;

    /**
     * An optional context menu event handler. This can be useful if you want to do something with the
     * mouse event unrelated to rendering the context menu itself, especially if that involves setting
     * React state (which is an error to do in the render code path of this component).
     */
    onContextMenu?: React.MouseEventHandler<HTMLElement>;

    /**
     * A limited subset of props to forward along to the popover generated by this component.
     */
    popoverProps?: IOverlayLifecycleProps & Pick<Popover2Props, "popoverClassName" | "transitionDuration">;

    /**
     * HTML tag to use for container element. Only used if this component's children are specified as
     * React node(s), not when it is a render function (in that case, you get to render whatever tag
     * you wish).
     *
     * @default "div"
     */
    tagName?: keyof JSX.IntrinsicElements;
}

export const ContextMenu2: React.FC<ContextMenu2Props> = React.forwardRef<any, ContextMenu2Props>((props, userRef) => {
    const {
        className,
        children,
        content,
        disabled = false,
        onContextMenu,
        popoverProps,
        tagName = "div",
        ...restProps
    } = props;

    // click target offset relative to the viewport (e.clientX/clientY), since the target will be rendered in a Portal
    const [targetOffset, setTargetOffset] = React.useState<Offset | undefined>(undefined);
    // hold a reference to the click mouse event to pass to content/child render functions
    const [mouseEvent, setMouseEvent] = React.useState<React.MouseEvent<HTMLElement>>();
    const [isOpen, setIsOpen] = React.useState<boolean>(false);

    // If disabled prop is changed, we don't want our old context menu to stick around.
    // If it has just been enabled (disabled = false), then the menu ought to be opened by
    // a new mouse event. Users should not be updating this prop in the onContextMenu callback
    // for this component (that will lead to unpredictable behavior).
    React.useEffect(() => {
        setIsOpen(false);
    }, [disabled]);

    const cancelContextMenu = React.useCallback((e: React.SyntheticEvent<HTMLDivElement>) => e.preventDefault(), []);

    const handlePopoverInteraction = React.useCallback((nextOpenState: boolean) => {
        if (!nextOpenState) {
            setIsOpen(false);
            setMouseEvent(undefined);
        }
    }, []);

    const targetRef = React.useRef<HTMLDivElement>(null);
    const renderTarget = React.useCallback(
        ({ ref }: Popover2TargetProps) => (
            <Portal>
                <div
                    className={Classes.CONTEXT_MENU2_POPOVER2_TARGET}
                    style={targetOffset}
                    ref={mergeRefs(ref, targetRef)}
                />
            </Portal>
        ),
        [targetOffset],
    );
    const isDarkTheme = React.useMemo(() => CoreUtils.isDarkTheme(targetRef.current), [targetRef.current]);

    const contentProps: ContextMenu2ContentProps = { isOpen, mouseEvent, targetOffset };

    // only render the popover if there is content in the context menu;
    // this avoid doing unnecessary rendering & computation
    const menu = disabled ? undefined : CoreUtils.isFunction(content) ? content(contentProps) : content;
    const maybePopover =
        menu === undefined ? undefined : (
            <Popover2
                {...popoverProps}
                autoFocus={false}
                content={
                    // this prevents right-clicking inside our context menu
                    <div onContextMenu={cancelContextMenu}>{menu}</div>
                }
                enforceFocus={false}
                // Generate key based on offset so that a new Popover instance is created
                // when offset changes, to force recomputing position.
                key={getPopoverKey(targetOffset)}
                hasBackdrop={true}
                isOpen={isOpen}
                minimal={true}
                onInteraction={handlePopoverInteraction}
                popoverClassName={classNames(Classes.CONTEXT_MENU2_POPOVER2, popoverProps?.popoverClassName, {
                    [CoreClasses.DARK]: isDarkTheme,
                })}
                placement="right-start"
                positioningStrategy="fixed"
                rootBoundary="viewport"
                renderTarget={renderTarget}
                transitionDuration={popoverProps?.transitionDuration ?? 100}
            />
        );

    const handleContextMenu = React.useCallback(
        (e: React.MouseEvent<HTMLElement>) => {
            // support nested menus (inner menu target would have called preventDefault())
            if (e.defaultPrevented) {
                return;
            }

            // If disabled, we should avoid this extra work. Otherwise: if using the child function API,
            // we need to make sure contentProps is up to date for correctness, so we handle the event regardless
            // of whether the consumer returned an undefined menu.
            const shouldHandleEvent = !disabled && (CoreUtils.isFunction(children) || maybePopover !== undefined);

            if (shouldHandleEvent) {
                e.preventDefault();
                e.persist();
                setMouseEvent(e);
                setTargetOffset({ left: e.clientX, top: e.clientY });
                setIsOpen(true);
            }

            onContextMenu?.(e);
        },
        [onContextMenu, disabled],
    );

    const containerClassName = classNames(className, Classes.CONTEXT_MENU2);

    if (CoreUtils.isFunction(children)) {
        return children({
            className: containerClassName,
            contentProps,
            onContextMenu: handleContextMenu,
            popover: maybePopover,
        });
    } else {
        return React.createElement(
            tagName,
            {
                className: containerClassName,
                onContextMenu: handleContextMenu,
                ref: userRef,
                ...restProps,
            },
            maybePopover,
            children,
        );
    }
});
ContextMenu2.displayName = "Blueprint.ContextMenu2";

function getPopoverKey(targetOffset: Offset | undefined) {
    return targetOffset === undefined ? "default" : `${targetOffset.left}x${targetOffset.top}`;
}
