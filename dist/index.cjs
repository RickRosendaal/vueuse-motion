'use strict';

const defu = require('defu');
const vue = require('vue');
const core = require('@vueuse/core');
const shared = require('@vueuse/shared');
const sync = require('framesync');
const popmotion = require('popmotion');
const styleValueTypes = require('style-value-types');
const shared$1 = require('@vue/shared');

function _interopDefaultCompat (e) { return e && typeof e === 'object' && 'default' in e ? e.default : e; }

const defu__default = /*#__PURE__*/_interopDefaultCompat(defu);
const sync__default = /*#__PURE__*/_interopDefaultCompat(sync);

const motionState = {};

class SubscriptionManager {
  constructor() {
    this.subscriptions = /* @__PURE__ */ new Set();
  }
  add(handler) {
    this.subscriptions.add(handler);
    return () => this.subscriptions.delete(handler);
  }
  notify(a, b, c) {
    if (!this.subscriptions.size)
      return;
    for (const handler of this.subscriptions)
      handler(a, b, c);
  }
  clear() {
    this.subscriptions.clear();
  }
}

function isFloat(value) {
  return !isNaN(parseFloat(value));
}
class MotionValue {
  /**
   * @param init - The initiating value
   * @param config - Optional configuration options
   */
  constructor(init) {
    /**
     * Duration, in milliseconds, since last updating frame.
     */
    this.timeDelta = 0;
    /**
     * Timestamp of the last time this `MotionValue` was updated.
     */
    this.lastUpdated = 0;
    /**
     * Functions to notify when the `MotionValue` updates.
     */
    this.updateSubscribers = new SubscriptionManager();
    /**
     * Tracks whether this value can output a velocity.
     */
    this.canTrackVelocity = false;
    /**
     * Update and notify `MotionValue` subscribers.
     *
     * @param v
     * @param render
     */
    this.updateAndNotify = (v) => {
      this.prev = this.current;
      this.current = v;
      const { delta, timestamp } = sync.getFrameData();
      if (this.lastUpdated !== timestamp) {
        this.timeDelta = delta;
        this.lastUpdated = timestamp;
      }
      sync__default.postRender(this.scheduleVelocityCheck);
      this.updateSubscribers.notify(this.current);
    };
    /**
     * Schedule a velocity check for the next frame.
     */
    this.scheduleVelocityCheck = () => sync__default.postRender(this.velocityCheck);
    /**
     * Updates `prev` with `current` if the value hasn't been updated this frame.
     * This ensures velocity calculations return `0`.
     */
    this.velocityCheck = ({ timestamp }) => {
      if (!this.canTrackVelocity)
        this.canTrackVelocity = isFloat(this.current);
      if (timestamp !== this.lastUpdated)
        this.prev = this.current;
    };
    this.prev = this.current = init;
    this.canTrackVelocity = isFloat(this.current);
  }
  /**
   * Adds a function that will be notified when the `MotionValue` is updated.
   *
   * It returns a function that, when called, will cancel the subscription.
   */
  onChange(subscription) {
    return this.updateSubscribers.add(subscription);
  }
  clearListeners() {
    this.updateSubscribers.clear();
  }
  /**
   * Sets the state of the `MotionValue`.
   *
   * @param v
   * @param render
   */
  set(v) {
    this.updateAndNotify(v);
  }
  /**
   * Returns the latest state of `MotionValue`
   *
   * @returns - The latest state of `MotionValue`
   */
  get() {
    return this.current;
  }
  /**
   * Get previous value.
   *
   * @returns - The previous latest state of `MotionValue`
   */
  getPrevious() {
    return this.prev;
  }
  /**
   * Returns the latest velocity of `MotionValue`
   *
   * @returns - The latest velocity of `MotionValue`. Returns `0` if the state is non-numerical.
   */
  getVelocity() {
    return this.canTrackVelocity ? popmotion.velocityPerSecond(parseFloat(this.current) - parseFloat(this.prev), this.timeDelta) : 0;
  }
  /**
   * Registers a new animation to control this `MotionValue`. Only one
   * animation can drive a `MotionValue` at one time.
   */
  start(animation) {
    this.stop();
    return new Promise((resolve) => {
      const { stop } = animation(resolve);
      this.stopAnimation = stop;
    }).then(() => this.clearAnimation());
  }
  /**
   * Stop the currently active animation.
   */
  stop() {
    if (this.stopAnimation)
      this.stopAnimation();
    this.clearAnimation();
  }
  /**
   * Returns `true` if this value is currently animating.
   */
  isAnimating() {
    return !!this.stopAnimation;
  }
  /**
   * Clear the current animation reference.
   */
  clearAnimation() {
    this.stopAnimation = null;
  }
  /**
   * Destroy and clean up subscribers to this `MotionValue`.
   */
  destroy() {
    this.updateSubscribers.clear();
    this.stop();
  }
}
function getMotionValue(init) {
  return new MotionValue(init);
}

const { isArray } = Array;
function useMotionValues() {
  const motionValues = vue.ref({});
  const stop = (keys) => {
    const destroyKey = (key) => {
      if (!motionValues.value[key])
        return;
      motionValues.value[key].stop();
      motionValues.value[key].destroy();
      delete motionValues.value[key];
    };
    if (keys) {
      if (isArray(keys)) {
        keys.forEach(destroyKey);
      } else {
        destroyKey(keys);
      }
    } else {
      Object.keys(motionValues.value).forEach(destroyKey);
    }
  };
  const get = (key, from, target) => {
    if (motionValues.value[key])
      return motionValues.value[key];
    const motionValue = getMotionValue(from);
    motionValue.onChange((v) => target[key] = v);
    motionValues.value[key] = motionValue;
    return motionValue;
  };
  shared.tryOnUnmounted(stop);
  return {
    motionValues,
    get,
    stop
  };
}

function isKeyframesTarget(v) {
  return Array.isArray(v);
}
function underDampedSpring() {
  return {
    type: "spring",
    stiffness: 500,
    damping: 25,
    restDelta: 0.5,
    restSpeed: 10
  };
}
function criticallyDampedSpring(to) {
  return {
    type: "spring",
    stiffness: 550,
    damping: to === 0 ? 2 * Math.sqrt(550) : 30,
    restDelta: 0.01,
    restSpeed: 10
  };
}
function overDampedSpring(to) {
  return {
    type: "spring",
    stiffness: 550,
    damping: to === 0 ? 100 : 30,
    restDelta: 0.01,
    restSpeed: 10
  };
}
function linearTween() {
  return {
    type: "keyframes",
    ease: "linear",
    duration: 300
  };
}
function keyframes(values) {
  return {
    type: "keyframes",
    duration: 800,
    values
  };
}
const defaultTransitions = {
  default: overDampedSpring,
  x: underDampedSpring,
  y: underDampedSpring,
  z: underDampedSpring,
  rotate: underDampedSpring,
  rotateX: underDampedSpring,
  rotateY: underDampedSpring,
  rotateZ: underDampedSpring,
  scaleX: criticallyDampedSpring,
  scaleY: criticallyDampedSpring,
  scale: criticallyDampedSpring,
  backgroundColor: linearTween,
  color: linearTween,
  opacity: linearTween
};
function getDefaultTransition(valueKey, to) {
  let transitionFactory;
  if (isKeyframesTarget(to)) {
    transitionFactory = keyframes;
  } else {
    transitionFactory = defaultTransitions[valueKey] || defaultTransitions.default;
  }
  return { to, ...transitionFactory(to) };
}

const int = {
  ...styleValueTypes.number,
  transform: Math.round
};
const valueTypes = {
  // Color props
  color: styleValueTypes.color,
  backgroundColor: styleValueTypes.color,
  outlineColor: styleValueTypes.color,
  fill: styleValueTypes.color,
  stroke: styleValueTypes.color,
  // Border props
  borderColor: styleValueTypes.color,
  borderTopColor: styleValueTypes.color,
  borderRightColor: styleValueTypes.color,
  borderBottomColor: styleValueTypes.color,
  borderLeftColor: styleValueTypes.color,
  borderWidth: styleValueTypes.px,
  borderTopWidth: styleValueTypes.px,
  borderRightWidth: styleValueTypes.px,
  borderBottomWidth: styleValueTypes.px,
  borderLeftWidth: styleValueTypes.px,
  borderRadius: styleValueTypes.px,
  radius: styleValueTypes.px,
  borderTopLeftRadius: styleValueTypes.px,
  borderTopRightRadius: styleValueTypes.px,
  borderBottomRightRadius: styleValueTypes.px,
  borderBottomLeftRadius: styleValueTypes.px,
  // Positioning props
  width: styleValueTypes.px,
  maxWidth: styleValueTypes.px,
  height: styleValueTypes.px,
  maxHeight: styleValueTypes.px,
  size: styleValueTypes.px,
  top: styleValueTypes.px,
  right: styleValueTypes.px,
  bottom: styleValueTypes.px,
  left: styleValueTypes.px,
  // Spacing props
  padding: styleValueTypes.px,
  paddingTop: styleValueTypes.px,
  paddingRight: styleValueTypes.px,
  paddingBottom: styleValueTypes.px,
  paddingLeft: styleValueTypes.px,
  margin: styleValueTypes.px,
  marginTop: styleValueTypes.px,
  marginRight: styleValueTypes.px,
  marginBottom: styleValueTypes.px,
  marginLeft: styleValueTypes.px,
  // Transform props
  rotate: styleValueTypes.degrees,
  rotateX: styleValueTypes.degrees,
  rotateY: styleValueTypes.degrees,
  rotateZ: styleValueTypes.degrees,
  scale: styleValueTypes.scale,
  scaleX: styleValueTypes.scale,
  scaleY: styleValueTypes.scale,
  scaleZ: styleValueTypes.scale,
  skew: styleValueTypes.degrees,
  skewX: styleValueTypes.degrees,
  skewY: styleValueTypes.degrees,
  distance: styleValueTypes.px,
  translateX: styleValueTypes.px,
  translateY: styleValueTypes.px,
  translateZ: styleValueTypes.px,
  x: styleValueTypes.px,
  y: styleValueTypes.px,
  z: styleValueTypes.px,
  perspective: styleValueTypes.px,
  transformPerspective: styleValueTypes.px,
  opacity: styleValueTypes.alpha,
  originX: styleValueTypes.progressPercentage,
  originY: styleValueTypes.progressPercentage,
  originZ: styleValueTypes.px,
  // Misc
  zIndex: int,
  filter: styleValueTypes.filter,
  WebkitFilter: styleValueTypes.filter,
  // SVG
  fillOpacity: styleValueTypes.alpha,
  strokeOpacity: styleValueTypes.alpha,
  numOctaves: int
};
const getValueType = (key) => valueTypes[key];
function getValueAsType(value, type) {
  return type && typeof value === "number" && type.transform ? type.transform(value) : value;
}
function getAnimatableNone(key, value) {
  let defaultValueType = getValueType(key);
  if (defaultValueType !== styleValueTypes.filter)
    defaultValueType = styleValueTypes.complex;
  return defaultValueType.getAnimatableNone ? defaultValueType.getAnimatableNone(value) : void 0;
}

const easingLookup = {
  linear: popmotion.linear,
  easeIn: popmotion.easeIn,
  easeInOut: popmotion.easeInOut,
  easeOut: popmotion.easeOut,
  circIn: popmotion.circIn,
  circInOut: popmotion.circInOut,
  circOut: popmotion.circOut,
  backIn: popmotion.backIn,
  backInOut: popmotion.backInOut,
  backOut: popmotion.backOut,
  anticipate: popmotion.anticipate,
  bounceIn: popmotion.bounceIn,
  bounceInOut: popmotion.bounceInOut,
  bounceOut: popmotion.bounceOut
};
function easingDefinitionToFunction(definition) {
  if (Array.isArray(definition)) {
    const [x1, y1, x2, y2] = definition;
    return popmotion.cubicBezier(x1, y1, x2, y2);
  } else if (typeof definition === "string") {
    return easingLookup[definition];
  }
  return definition;
}
function isEasingArray(ease) {
  return Array.isArray(ease) && typeof ease[0] !== "number";
}
function isAnimatable(key, value) {
  if (key === "zIndex")
    return false;
  if (typeof value === "number" || Array.isArray(value))
    return true;
  if (typeof value === "string" && // It's animatable if we have a string
  styleValueTypes.complex.test(value) && // And it contains numbers and/or colors
  !value.startsWith("url("))
    return true;
  return false;
}
function hydrateKeyframes(options) {
  if (Array.isArray(options.to) && options.to[0] === null) {
    options.to = [...options.to];
    options.to[0] = options.from;
  }
  return options;
}
function convertTransitionToAnimationOptions({ ease, times, delay, ...transition }) {
  const options = { ...transition };
  if (times)
    options.offset = times;
  if (ease) {
    options.ease = isEasingArray(ease) ? ease.map(easingDefinitionToFunction) : easingDefinitionToFunction(ease);
  }
  if (delay)
    options.elapsed = -delay;
  return options;
}
function getPopmotionAnimationOptions(transition, options, key) {
  if (Array.isArray(options.to)) {
    if (!transition.duration)
      transition.duration = 800;
  }
  hydrateKeyframes(options);
  if (!isTransitionDefined(transition)) {
    transition = {
      ...transition,
      ...getDefaultTransition(key, options.to)
    };
  }
  return {
    ...options,
    ...convertTransitionToAnimationOptions(transition)
  };
}
function isTransitionDefined({ delay, repeat, repeatType, repeatDelay, from, ...transition }) {
  return !!Object.keys(transition).length;
}
function getValueTransition(transition, key) {
  return transition[key] || transition.default || transition;
}
function getAnimation(key, value, target, transition, onComplete) {
  const valueTransition = getValueTransition(transition, key);
  let origin = valueTransition.from === null || valueTransition.from === void 0 ? value.get() : valueTransition.from;
  const isTargetAnimatable = isAnimatable(key, target);
  if (origin === "none" && isTargetAnimatable && typeof target === "string")
    origin = getAnimatableNone(key, target);
  const isOriginAnimatable = isAnimatable(key, origin);
  function start(complete) {
    const options = {
      from: origin,
      to: target,
      velocity: transition.velocity ? transition.velocity : value.getVelocity(),
      onUpdate: (v) => value.set(v)
    };
    return valueTransition.type === "inertia" || valueTransition.type === "decay" ? popmotion.inertia({ ...options, ...valueTransition }) : popmotion.animate({
      ...getPopmotionAnimationOptions(valueTransition, options, key),
      onUpdate: (v) => {
        options.onUpdate(v);
        if (valueTransition.onUpdate)
          valueTransition.onUpdate(v);
      },
      onComplete: () => {
        if (transition.onComplete)
          transition.onComplete();
        if (onComplete)
          onComplete();
        if (complete)
          complete();
      }
    });
  }
  function set(complete) {
    value.set(target);
    if (transition.onComplete)
      transition.onComplete();
    if (onComplete)
      onComplete();
    if (complete)
      complete();
    return { stop: () => {
    } };
  }
  return !isOriginAnimatable || !isTargetAnimatable || valueTransition.type === false ? set : start;
}

function useMotionTransitions() {
  const { motionValues, stop, get } = useMotionValues();
  const push = (key, value, target, transition = {}, onComplete) => {
    const from = target[key];
    const motionValue = get(key, from, target);
    if (transition && transition.immediate) {
      motionValue.set(value);
      return;
    }
    const animation = getAnimation(key, motionValue, value, transition, onComplete);
    motionValue.start(animation);
  };
  return { motionValues, stop, push };
}

function useMotionControls(motionProperties, variants = {}, { motionValues, push, stop } = useMotionTransitions()) {
  const _variants = vue.unref(variants);
  const isAnimating = vue.ref(false);
  vue.watch(
    motionValues,
    (newVal) => {
      isAnimating.value = Object.values(newVal).filter((value) => value.isAnimating()).length > 0;
    },
    {
      immediate: true,
      deep: true
    }
  );
  const getVariantFromKey = (variant) => {
    if (!_variants || !_variants[variant])
      throw new Error(`The variant ${variant} does not exist.`);
    return _variants[variant];
  };
  const apply = (variant) => {
    if (typeof variant === "string")
      variant = getVariantFromKey(variant);
    return Promise.all(
      Object.entries(variant).map(([key, value]) => {
        if (key === "transition")
          return void 0;
        return new Promise(
          (resolve) => (
            // @ts-expect-error - Fix errors later for typescript 5
            push(key, value, motionProperties, variant.transition || getDefaultTransition(key, variant[key]), resolve)
          )
        );
      }).filter(Boolean)
    );
  };
  const set = (variant) => {
    const variantData = core.isObject(variant) ? variant : getVariantFromKey(variant);
    Object.entries(variantData).forEach(([key, value]) => {
      if (key === "transition")
        return;
      push(key, value, motionProperties, {
        immediate: true
      });
    });
  };
  const leave = async (done) => {
    let leaveVariant;
    if (_variants) {
      if (_variants.leave)
        leaveVariant = _variants.leave;
      if (!_variants.leave && _variants.initial)
        leaveVariant = _variants.initial;
    }
    if (!leaveVariant) {
      done();
      return;
    }
    await apply(leaveVariant);
    done();
  };
  return {
    isAnimating,
    apply,
    set,
    leave,
    stop
  };
}

const isBrowser = typeof window !== "undefined";
const supportsPointerEvents = () => isBrowser && window.onpointerdown === null;
const supportsTouchEvents = () => isBrowser && window.ontouchstart === null;
const supportsMouseEvents = () => isBrowser && window.onmousedown === null;

function registerEventListeners({ target, state, variants, apply }) {
  const _variants = vue.unref(variants);
  const hovered = vue.ref(false);
  const tapped = vue.ref(false);
  const focused = vue.ref(false);
  const mutableKeys = vue.computed(() => {
    let result = [];
    if (!_variants)
      return result;
    if (_variants.hovered)
      result = [...result, ...Object.keys(_variants.hovered)];
    if (_variants.tapped)
      result = [...result, ...Object.keys(_variants.tapped)];
    if (_variants.focused)
      result = [...result, ...Object.keys(_variants.focused)];
    return result;
  });
  const computedProperties = vue.computed(() => {
    const result = {};
    Object.assign(result, state.value);
    if (hovered.value && _variants.hovered)
      Object.assign(result, _variants.hovered);
    if (tapped.value && _variants.tapped)
      Object.assign(result, _variants.tapped);
    if (focused.value && _variants.focused)
      Object.assign(result, _variants.focused);
    for (const key in result) {
      if (!mutableKeys.value.includes(key))
        delete result[key];
    }
    return result;
  });
  if (_variants.hovered) {
    core.useEventListener(target, "mouseenter", () => hovered.value = true);
    core.useEventListener(target, "mouseleave", () => {
      hovered.value = false;
      tapped.value = false;
    });
    core.useEventListener(target, "mouseout", () => {
      hovered.value = false;
      tapped.value = false;
    });
  }
  if (_variants.tapped) {
    if (supportsMouseEvents()) {
      core.useEventListener(target, "mousedown", () => tapped.value = true);
      core.useEventListener(target, "mouseup", () => tapped.value = false);
    }
    if (supportsPointerEvents()) {
      core.useEventListener(target, "pointerdown", () => tapped.value = true);
      core.useEventListener(target, "pointerup", () => tapped.value = false);
    }
    if (supportsTouchEvents()) {
      core.useEventListener(target, "touchstart", () => tapped.value = true);
      core.useEventListener(target, "touchend", () => tapped.value = false);
    }
  }
  if (_variants.focused) {
    core.useEventListener(target, "focus", () => focused.value = true);
    core.useEventListener(target, "blur", () => focused.value = false);
  }
  vue.watch(computedProperties, apply);
}

function registerLifeCycleHooks({ set, target, variants, variant }) {
  const _variants = vue.unref(variants);
  vue.watch(
    () => target,
    () => {
      if (!_variants)
        return;
      if (_variants.initial)
        set("initial");
      if (_variants.enter)
        variant.value = "enter";
    },
    {
      immediate: true,
      flush: "pre"
    }
  );
}

function registerVariantsSync({ state, apply }) {
  vue.watch(
    state,
    (newVal) => {
      if (newVal)
        apply(newVal);
    },
    {
      immediate: true
    }
  );
}

function registerVisibilityHooks({ target, variants, variant }) {
  const _variants = vue.unref(variants);
  if (_variants && (_variants.visible || _variants.visibleOnce)) {
    core.useIntersectionObserver(target, (observerEntries) => {
      const isIntersecting = observerEntries.some(({ isIntersecting: isIntersecting2 }) => isIntersecting2);
      if (_variants.visible) {
        if (isIntersecting)
          variant.value = "visible";
        else
          variant.value = "initial";
      } else if (_variants.visibleOnce) {
        if (isIntersecting && variant.value !== "visibleOnce")
          variant.value = "visibleOnce";
        else if (!variant.value)
          variant.value = "initial";
      }
    });
  }
}

function useMotionFeatures(instance, options = {
  syncVariants: true,
  lifeCycleHooks: true,
  visibilityHooks: true,
  eventListeners: true
}) {
  if (options.lifeCycleHooks)
    registerLifeCycleHooks(instance);
  if (options.syncVariants)
    registerVariantsSync(instance);
  if (options.visibilityHooks)
    registerVisibilityHooks(instance);
  if (options.eventListeners)
    registerEventListeners(instance);
}

function reactiveStyle(props = {}) {
  const state = vue.reactive({
    ...props
  });
  const style = vue.ref({});
  vue.watch(
    state,
    () => {
      const result = {};
      for (const [key, value] of Object.entries(state)) {
        const valueType = getValueType(key);
        const valueAsType = getValueAsType(value, valueType);
        result[key] = valueAsType;
      }
      style.value = result;
    },
    {
      immediate: true,
      deep: true
    }
  );
  return {
    state,
    style
  };
}

function usePermissiveTarget(target, onTarget) {
  vue.watch(
    () => core.unrefElement(target),
    (el) => {
      if (!el)
        return;
      onTarget(el);
    },
    {
      immediate: true
    }
  );
}

const translateAlias = {
  x: "translateX",
  y: "translateY",
  z: "translateZ"
};
function reactiveTransform(props = {}, enableHardwareAcceleration = true) {
  const state = vue.reactive({ ...props });
  const transform = vue.ref("");
  vue.watch(
    state,
    (newVal) => {
      let result = "";
      let hasHardwareAcceleration = false;
      if (enableHardwareAcceleration && (newVal.x || newVal.y || newVal.z)) {
        const str = [newVal.x || 0, newVal.y || 0, newVal.z || 0].map(styleValueTypes.px.transform).join(",");
        result += `translate3d(${str}) `;
        hasHardwareAcceleration = true;
      }
      for (const [key, value] of Object.entries(newVal)) {
        if (enableHardwareAcceleration && (key === "x" || key === "y" || key === "z"))
          continue;
        const valueType = getValueType(key);
        const valueAsType = getValueAsType(value, valueType);
        result += `${translateAlias[key] || key}(${valueAsType}) `;
      }
      if (enableHardwareAcceleration && !hasHardwareAcceleration)
        result += "translateZ(0px) ";
      transform.value = result.trim();
    },
    {
      immediate: true,
      deep: true
    }
  );
  return {
    state,
    transform
  };
}

const transformAxes = ["", "X", "Y", "Z"];
const order = ["perspective", "translate", "scale", "rotate", "skew"];
const transformProps = ["transformPerspective", "x", "y", "z"];
order.forEach((operationKey) => {
  transformAxes.forEach((axesKey) => {
    const key = operationKey + axesKey;
    transformProps.push(key);
  });
});
const transformPropSet = new Set(transformProps);
function isTransformProp(key) {
  return transformPropSet.has(key);
}
const transformOriginProps = /* @__PURE__ */ new Set(["originX", "originY", "originZ"]);
function isTransformOriginProp(key) {
  return transformOriginProps.has(key);
}
function splitValues(variant) {
  const transform = {};
  const style = {};
  Object.entries(variant).forEach(([key, value]) => {
    if (isTransformProp(key) || isTransformOriginProp(key))
      transform[key] = value;
    else
      style[key] = value;
  });
  return { transform, style };
}
function variantToStyle(variant) {
  const { transform: _transform, style: _style } = splitValues(variant);
  const { transform } = reactiveTransform(_transform);
  const { style } = reactiveStyle(_style);
  if (transform.value)
    style.value.transform = transform.value;
  return style.value;
}

function useElementStyle(target, onInit) {
  let _cache;
  let _target;
  const { state, style } = reactiveStyle();
  usePermissiveTarget(target, (el) => {
    _target = el;
    for (const key of Object.keys(valueTypes)) {
      if (el.style[key] === null || el.style[key] === "" || isTransformProp(key) || isTransformOriginProp(key))
        continue;
      state[key] = el.style[key];
    }
    if (_cache) {
      Object.entries(_cache).forEach(([key, value]) => el.style[key] = value);
    }
    if (onInit)
      onInit(state);
  });
  vue.watch(
    style,
    (newVal) => {
      if (!_target) {
        _cache = newVal;
        return;
      }
      for (const key in newVal)
        _target.style[key] = newVal[key];
    },
    {
      immediate: true
    }
  );
  return {
    style: state
  };
}

function parseTransform(transform) {
  const transforms = transform.trim().split(/\) |\)/);
  if (transforms.length === 1)
    return {};
  const parseValues = (value) => {
    if (value.endsWith("px") || value.endsWith("deg"))
      return parseFloat(value);
    if (isNaN(Number(value)))
      return Number(value);
    return value;
  };
  return transforms.reduce((acc, transform2) => {
    if (!transform2)
      return acc;
    const [name, transformValue] = transform2.split("(");
    const valueArray = transformValue.split(",");
    const values = valueArray.map((val) => {
      return parseValues(val.endsWith(")") ? val.replace(")", "") : val.trim());
    });
    const value = values.length === 1 ? values[0] : values;
    return {
      ...acc,
      [name]: value
    };
  }, {});
}
function stateFromTransform(state, transform) {
  Object.entries(parseTransform(transform)).forEach(([key, value]) => {
    const axes = ["x", "y", "z"];
    if (key === "translate3d") {
      if (value === 0) {
        axes.forEach((axis) => state[axis] = 0);
        return;
      }
      value.forEach((axisValue, index) => state[axes[index]] = axisValue);
      return;
    }
    value = parseFloat(value);
    if (key === "translateX") {
      state.x = value;
      return;
    }
    if (key === "translateY") {
      state.y = value;
      return;
    }
    if (key === "translateZ") {
      state.z = value;
      return;
    }
    state[key] = value;
  });
}

function useElementTransform(target, onInit) {
  let _cache;
  let _target;
  const { state, transform } = reactiveTransform();
  usePermissiveTarget(target, (el) => {
    _target = el;
    if (el.style.transform)
      stateFromTransform(state, el.style.transform);
    if (_cache)
      el.style.transform = _cache;
    if (onInit)
      onInit(state);
  });
  vue.watch(
    transform,
    (newValue) => {
      if (!_target) {
        _cache = newValue;
        return;
      }
      _target.style.transform = newValue;
    },
    {
      immediate: true
    }
  );
  return {
    transform: state
  };
}

function useMotionProperties(target, defaultValues) {
  const motionProperties = vue.reactive({});
  const apply = (values) => Object.entries(values).forEach(([key, value]) => motionProperties[key] = value);
  const { style } = useElementStyle(target, apply);
  const { transform } = useElementTransform(target, apply);
  vue.watch(
    motionProperties,
    (newVal) => {
      Object.entries(newVal).forEach(([key, value]) => {
        const target2 = isTransformProp(key) ? transform : style;
        if (target2[key] && target2[key] === value)
          return;
        target2[key] = value;
      });
    },
    {
      immediate: true,
      deep: true
    }
  );
  usePermissiveTarget(target, () => defaultValues && apply(defaultValues));
  return {
    motionProperties,
    style,
    transform
  };
}

function useMotionVariants(variants = {}) {
  const _variants = vue.unref(variants);
  const variant = vue.ref();
  const state = vue.computed(() => {
    if (!variant.value)
      return;
    return _variants[variant.value];
  });
  return {
    state,
    variant
  };
}

function useMotion(target, variants = {}, options) {
  const { motionProperties } = useMotionProperties(target);
  const { variant, state } = useMotionVariants(variants);
  const controls = useMotionControls(motionProperties, variants);
  const instance = {
    target,
    variant,
    variants,
    state,
    motionProperties,
    ...controls
  };
  useMotionFeatures(instance, options);
  return instance;
}

const directivePropsKeys = ["initial", "enter", "leave", "visible", "visible-once", "hovered", "tapped", "focused", "delay"];
function resolveVariants(node, variantsRef) {
  const target = node.props ? node.props : node.data && node.data.attrs ? node.data.attrs : {};
  if (target) {
    if (target.variants && core.isObject(target.variants)) {
      variantsRef.value = {
        ...variantsRef.value,
        ...target.variants
      };
    }
    directivePropsKeys.forEach((key) => {
      if (key === "delay") {
        if (target && target[key] && typeof target[key] === "number") {
          const delay = target[key];
          if (variantsRef && variantsRef.value) {
            if (variantsRef.value.enter) {
              if (!variantsRef.value.enter.transition)
                variantsRef.value.enter.transition = {};
              variantsRef.value.enter.transition = {
                delay,
                ...variantsRef.value.enter.transition
              };
            }
            if (variantsRef.value.visible) {
              if (!variantsRef.value.visible.transition)
                variantsRef.value.visible.transition = {};
              variantsRef.value.visible.transition = {
                delay,
                ...variantsRef.value.visible.transition
              };
            }
            if (variantsRef.value.visibleOnce) {
              if (!variantsRef.value.visibleOnce.transition)
                variantsRef.value.visibleOnce.transition = {};
              variantsRef.value.visibleOnce.transition = {
                delay,
                ...variantsRef.value.visibleOnce.transition
              };
            }
          }
        }
        return;
      }
      if (key === "visible-once")
        key = "visibleOnce";
      if (target && target[key] && core.isObject(target[key]))
        variantsRef.value[key] = target[key];
    });
  }
}

function directive(variants = {}) {
  const register = (el, binding, node) => {
    const key = binding.value && typeof binding.value === "string" ? binding.value : node.key;
    if (key && motionState[key])
      motionState[key].stop();
    const variantsRef = vue.ref(variants);
    if (typeof binding.value === "object")
      variantsRef.value = binding.value;
    resolveVariants(node, variantsRef);
    const motionInstance = useMotion(el, variantsRef);
    el.motionInstance = motionInstance;
    if (key)
      motionState[key] = motionInstance;
  };
  return {
    created: register,
    getSSRProps(binding, node) {
      let { initial: bindingInitial } = binding.value || node && node?.props || {};
      bindingInitial = vue.unref(bindingInitial);
      const initial = defu__default(variants?.initial || {}, bindingInitial || {});
      if (!initial || Object.keys(initial).length === 0)
        return;
      const style = variantToStyle(initial);
      return {
        style
      };
    }
  };
}

const fade = {
  initial: {
    opacity: 0
  },
  enter: {
    opacity: 1
  }
};
const fadeVisible = {
  initial: {
    opacity: 0
  },
  visible: {
    opacity: 1
  }
};
const fadeVisibleOnce = {
  initial: {
    opacity: 0
  },
  visibleOnce: {
    opacity: 1
  }
};

const pop = {
  initial: {
    scale: 0,
    opacity: 0
  },
  enter: {
    scale: 1,
    opacity: 1
  }
};
const popVisible = {
  initial: {
    scale: 0,
    opacity: 0
  },
  visible: {
    scale: 1,
    opacity: 1
  }
};
const popVisibleOnce = {
  initial: {
    scale: 0,
    opacity: 0
  },
  visibleOnce: {
    scale: 1,
    opacity: 1
  }
};

const rollLeft = {
  initial: {
    x: -100,
    rotate: 90,
    opacity: 0
  },
  enter: {
    x: 0,
    rotate: 0,
    opacity: 1
  }
};
const rollVisibleLeft = {
  initial: {
    x: -100,
    rotate: 90,
    opacity: 0
  },
  visible: {
    x: 0,
    rotate: 0,
    opacity: 1
  }
};
const rollVisibleOnceLeft = {
  initial: {
    x: -100,
    rotate: 90,
    opacity: 0
  },
  visibleOnce: {
    x: 0,
    rotate: 0,
    opacity: 1
  }
};
const rollRight = {
  initial: {
    x: 100,
    rotate: -90,
    opacity: 0
  },
  enter: {
    x: 0,
    rotate: 0,
    opacity: 1
  }
};
const rollVisibleRight = {
  initial: {
    x: 100,
    rotate: -90,
    opacity: 0
  },
  visible: {
    x: 0,
    rotate: 0,
    opacity: 1
  }
};
const rollVisibleOnceRight = {
  initial: {
    x: 100,
    rotate: -90,
    opacity: 0
  },
  visibleOnce: {
    x: 0,
    rotate: 0,
    opacity: 1
  }
};
const rollTop = {
  initial: {
    y: -100,
    rotate: -90,
    opacity: 0
  },
  enter: {
    y: 0,
    rotate: 0,
    opacity: 1
  }
};
const rollVisibleTop = {
  initial: {
    y: -100,
    rotate: -90,
    opacity: 0
  },
  visible: {
    y: 0,
    rotate: 0,
    opacity: 1
  }
};
const rollVisibleOnceTop = {
  initial: {
    y: -100,
    rotate: -90,
    opacity: 0
  },
  visibleOnce: {
    y: 0,
    rotate: 0,
    opacity: 1
  }
};
const rollBottom = {
  initial: {
    y: 100,
    rotate: 90,
    opacity: 0
  },
  enter: {
    y: 0,
    rotate: 0,
    opacity: 1
  }
};
const rollVisibleBottom = {
  initial: {
    y: 100,
    rotate: 90,
    opacity: 0
  },
  visible: {
    y: 0,
    rotate: 0,
    opacity: 1
  }
};
const rollVisibleOnceBottom = {
  initial: {
    y: 100,
    rotate: 90,
    opacity: 0
  },
  visibleOnce: {
    y: 0,
    rotate: 0,
    opacity: 1
  }
};

const slideLeft = {
  initial: {
    x: -100,
    opacity: 0
  },
  enter: {
    x: 0,
    opacity: 1
  }
};
const slideVisibleLeft = {
  initial: {
    x: -100,
    opacity: 0
  },
  visible: {
    x: 0,
    opacity: 1
  }
};
const slideVisibleOnceLeft = {
  initial: {
    x: -100,
    opacity: 0
  },
  visibleOnce: {
    x: 0,
    opacity: 1
  }
};
const slideRight = {
  initial: {
    x: 100,
    opacity: 0
  },
  enter: {
    x: 0,
    opacity: 1
  }
};
const slideVisibleRight = {
  initial: {
    x: 100,
    opacity: 0
  },
  visible: {
    x: 0,
    opacity: 1
  }
};
const slideVisibleOnceRight = {
  initial: {
    x: 100,
    opacity: 0
  },
  visibleOnce: {
    x: 0,
    opacity: 1
  }
};
const slideTop = {
  initial: {
    y: -100,
    opacity: 0
  },
  enter: {
    y: 0,
    opacity: 1
  }
};
const slideVisibleTop = {
  initial: {
    y: -100,
    opacity: 0
  },
  visible: {
    y: 0,
    opacity: 1
  }
};
const slideVisibleOnceTop = {
  initial: {
    y: -100,
    opacity: 0
  },
  visibleOnce: {
    y: 0,
    opacity: 1
  }
};
const slideBottom = {
  initial: {
    y: 100,
    opacity: 0
  },
  enter: {
    y: 0,
    opacity: 1
  }
};
const slideVisibleBottom = {
  initial: {
    y: 100,
    opacity: 0
  },
  visible: {
    y: 0,
    opacity: 1
  }
};
const slideVisibleOnceBottom = {
  initial: {
    y: 100,
    opacity: 0
  },
  visibleOnce: {
    y: 0,
    opacity: 1
  }
};

const presets = {
  __proto__: null,
  fade: fade,
  fadeVisible: fadeVisible,
  fadeVisibleOnce: fadeVisibleOnce,
  pop: pop,
  popVisible: popVisible,
  popVisibleOnce: popVisibleOnce,
  rollBottom: rollBottom,
  rollLeft: rollLeft,
  rollRight: rollRight,
  rollTop: rollTop,
  rollVisibleBottom: rollVisibleBottom,
  rollVisibleLeft: rollVisibleLeft,
  rollVisibleOnceBottom: rollVisibleOnceBottom,
  rollVisibleOnceLeft: rollVisibleOnceLeft,
  rollVisibleOnceRight: rollVisibleOnceRight,
  rollVisibleOnceTop: rollVisibleOnceTop,
  rollVisibleRight: rollVisibleRight,
  rollVisibleTop: rollVisibleTop,
  slideBottom: slideBottom,
  slideLeft: slideLeft,
  slideRight: slideRight,
  slideTop: slideTop,
  slideVisibleBottom: slideVisibleBottom,
  slideVisibleLeft: slideVisibleLeft,
  slideVisibleOnceBottom: slideVisibleOnceBottom,
  slideVisibleOnceLeft: slideVisibleOnceLeft,
  slideVisibleOnceRight: slideVisibleOnceRight,
  slideVisibleOnceTop: slideVisibleOnceTop,
  slideVisibleRight: slideVisibleRight,
  slideVisibleTop: slideVisibleTop
};

const component = vue.defineComponent({
  props: {
    is: {
      type: [String, Object],
      required: false
    },
    // Preset to be loaded
    preset: {
      type: String,
      required: false
    },
    // Instance
    instance: {
      type: Object,
      required: false
    },
    // Variants
    variants: {
      type: Object,
      required: false
    },
    // Initial variant
    initial: {
      type: Object,
      required: false
    },
    // Lifecycle hooks variants
    enter: {
      type: Object,
      required: false
    },
    leave: {
      type: Object,
      required: false
    },
    // Intersection observer variants
    visible: {
      type: Object,
      required: false
    },
    visibleOnce: {
      type: Object,
      required: false
    },
    // Event listeners variants
    hovered: {
      type: Object,
      required: false
    },
    tapped: {
      type: Object,
      required: false
    },
    focused: {
      type: Object,
      required: false
    },
    // Helpers
    delay: {
      type: [Number, String],
      required: false
    }
  },
  setup(props) {
    const slots = vue.useSlots();
    const instances = vue.reactive({});
    if (!props.is && !slots.default)
      return () => vue.h("div", {});
    const _preset = vue.computed(() => {
      let preset;
      if (props.preset)
        preset = presets[props.preset];
      return preset;
    });
    const propsConfig = vue.computed(() => ({
      initial: props.initial,
      enter: props.enter,
      leave: props.leave,
      visible: props.visible,
      visibleOnce: props.visibleOnce,
      hovered: props.hovered,
      tapped: props.tapped,
      focused: props.focused
    }));
    const motionConfig = vue.computed(() => {
      const config = {
        ...propsConfig.value,
        ..._preset.value || {},
        ...props.variants || {}
      };
      if (props.delay) {
        config.enter.transition = { ...config.enter.transition };
        config.enter.transition.delay = parseInt(props.delay);
      }
      return config;
    });
    const component = vue.computed(() => {
      if (!props.is)
        return;
      let comp = props.is;
      if (typeof component.value === "string" && !shared$1.isHTMLTag(comp)) {
        comp = vue.resolveComponent(comp);
      }
      return comp;
    });
    if (process?.env?.NODE_ENV === "development" || process?.dev) {
      const replayAnimation = (instance) => {
        if (instance.variants?.initial)
          instance.set("initial");
        setTimeout(() => {
          if (instance.variants?.enter)
            instance.apply("enter");
          if (instance.variants?.visible)
            instance.apply("visible");
          if (instance.variants?.visibleOnce)
            instance.apply("visibleOnce");
        }, 10);
      };
      vue.onUpdated(() => Object.entries(instances).forEach(([_, value]) => replayAnimation(value)));
    }
    return {
      slots,
      component,
      motionConfig,
      instances
    };
  },
  render({ slots, motionConfig, instances, component }) {
    const style = variantToStyle(motionConfig.initial || {});
    const setNode = (node, index) => {
      if (!node.props)
        node.props = {};
      node.props.style = style;
      node.props.onVnodeMounted = ({ el }) => {
        const instance = useMotion(el, motionConfig);
        instances[index] = instance;
      };
      return node;
    };
    if (component) {
      const node = vue.h(component, void 0, slots);
      setNode(node, 0);
      return node;
    }
    const nodes = slots.default?.() || [];
    return nodes.map((node, index) => setNode(node, index));
  }
});

function slugify(string) {
  const a = "\xE0\xE1\xE2\xE4\xE6\xE3\xE5\u0101\u0103\u0105\xE7\u0107\u010D\u0111\u010F\xE8\xE9\xEA\xEB\u0113\u0117\u0119\u011B\u011F\u01F5\u1E27\xEE\xEF\xED\u012B\u012F\xEC\u0142\u1E3F\xF1\u0144\u01F9\u0148\xF4\xF6\xF2\xF3\u0153\xF8\u014D\xF5\u0151\u1E55\u0155\u0159\xDF\u015B\u0161\u015F\u0219\u0165\u021B\xFB\xFC\xF9\xFA\u016B\u01D8\u016F\u0171\u0173\u1E83\u1E8D\xFF\xFD\u017E\u017A\u017C\xB7/_,:;";
  const b = "aaaaaaaaaacccddeeeeeeeegghiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz------";
  const p = new RegExp(a.split("").join("|"), "g");
  return string.toString().replace(/[A-Z]/g, (s) => `-${s}`).toLowerCase().replace(/\s+/g, "-").replace(p, (c) => b.charAt(a.indexOf(c))).replace(/&/g, "-and-").replace(/[^\w\-]+/g, "").replace(/\-\-+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
}

const MotionPlugin = {
  install(app, options) {
    app.directive("motion", directive());
    app.component("Motion", component);
    if (!options || options && !options.excludePresets) {
      for (const key in presets) {
        const preset = presets[key];
        app.directive(`motion-${slugify(key)}`, directive(preset));
      }
    }
    if (options && options.directives) {
      for (const key in options.directives) {
        const variants = options.directives[key];
        if (!variants.initial && __DEV__) {
          console.warn(`Your directive v-motion-${key} is missing initial variant!`);
        }
        app.directive(`motion-${key}`, directive(variants));
      }
    }
  }
};

function isMotionInstance(obj) {
  const _obj = obj;
  return _obj.apply !== void 0 && typeof _obj.apply === "function" && _obj.set !== void 0 && typeof _obj.set === "function" && _obj.target !== void 0 && vue.isRef(_obj.target);
}

function useMotions() {
  return motionState;
}

function useSpring(values, spring) {
  const { stop, get } = useMotionValues();
  return {
    values,
    stop,
    set: (properties) => Promise.all(
      Object.entries(properties).map(([key, value]) => {
        const motionValue = get(key, values[key], values);
        return motionValue.start((onComplete) => {
          const options = {
            type: "spring",
            ...spring || getDefaultTransition(key, value)
          };
          return popmotion.animate({
            from: motionValue.get(),
            to: value,
            velocity: motionValue.getVelocity(),
            onUpdate: (v) => motionValue.set(v),
            onComplete,
            ...options
          });
        });
      })
    )
  };
}

function useReducedMotion(options = {}) {
  return core.useMediaQuery("(prefers-reduced-motion: reduce)", options);
}

exports.MotionDirective = directive;
exports.MotionPlugin = MotionPlugin;
exports.fade = fade;
exports.fadeVisible = fadeVisible;
exports.fadeVisibleOnce = fadeVisibleOnce;
exports.isMotionInstance = isMotionInstance;
exports.pop = pop;
exports.popVisible = popVisible;
exports.popVisibleOnce = popVisibleOnce;
exports.reactiveStyle = reactiveStyle;
exports.reactiveTransform = reactiveTransform;
exports.rollBottom = rollBottom;
exports.rollLeft = rollLeft;
exports.rollRight = rollRight;
exports.rollTop = rollTop;
exports.rollVisibleBottom = rollVisibleBottom;
exports.rollVisibleLeft = rollVisibleLeft;
exports.rollVisibleOnceBottom = rollVisibleOnceBottom;
exports.rollVisibleOnceLeft = rollVisibleOnceLeft;
exports.rollVisibleOnceRight = rollVisibleOnceRight;
exports.rollVisibleOnceTop = rollVisibleOnceTop;
exports.rollVisibleRight = rollVisibleRight;
exports.rollVisibleTop = rollVisibleTop;
exports.slideBottom = slideBottom;
exports.slideLeft = slideLeft;
exports.slideRight = slideRight;
exports.slideTop = slideTop;
exports.slideVisibleBottom = slideVisibleBottom;
exports.slideVisibleLeft = slideVisibleLeft;
exports.slideVisibleOnceBottom = slideVisibleOnceBottom;
exports.slideVisibleOnceLeft = slideVisibleOnceLeft;
exports.slideVisibleOnceRight = slideVisibleOnceRight;
exports.slideVisibleOnceTop = slideVisibleOnceTop;
exports.slideVisibleRight = slideVisibleRight;
exports.slideVisibleTop = slideVisibleTop;
exports.slugify = slugify;
exports.useElementStyle = useElementStyle;
exports.useElementTransform = useElementTransform;
exports.useMotion = useMotion;
exports.useMotionControls = useMotionControls;
exports.useMotionProperties = useMotionProperties;
exports.useMotionTransitions = useMotionTransitions;
exports.useMotionVariants = useMotionVariants;
exports.useMotions = useMotions;
exports.useReducedMotion = useReducedMotion;
exports.useSpring = useSpring;