import { useIntersectionObserver } from '@vueuse/core'
import { unref } from 'vue'
import type { MotionInstance, MotionVariants } from '../types'

export function registerVisibilityHooks<T extends string, V extends MotionVariants<T>>({ target, variants, variant }: MotionInstance<T, V>) {
  const _variants = unref(variants)

  // Bind intersection observer on target
  if (_variants && (_variants.visible || _variants.visibleOnce)) {
    useIntersectionObserver(target, (observerEntries: IntersectionObserverEntry[]) => {
      const isIntersecting = observerEntries.some(({ isIntersecting }) => isIntersecting)
      if (_variants.visible) {
        if (isIntersecting) variant.value = 'visible'
        else variant.value = 'initial'
      } else if (_variants.visibleOnce) {
        if (isIntersecting && variant.value !== 'visibleOnce') variant.value = 'visibleOnce'
        else if (!variant.value) variant.value = 'initial'
      }
    })
  }
}
