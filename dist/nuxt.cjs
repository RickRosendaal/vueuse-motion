'use strict';

const defu = require('defu');
const kit = require('@nuxt/kit');

const module$1 = kit.defineNuxtModule({
  meta: {
    name: "@vueuse/motion",
    configKey: "motion"
  },
  defaults: {},
  setup(options, nuxt) {
    const { resolve } = kit.createResolver((typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (document.currentScript && document.currentScript.src || new URL('nuxt.cjs', document.baseURI).href)));
    nuxt.options.runtimeConfig.motion = defu.defu(nuxt.options.runtimeConfig?.motion || {}, options);
    kit.addPlugin(resolve("./runtime/templates/motion"));
    kit.addImportsDir(resolve("./runtime/composables"));
    if (!nuxt.options.build.transpile)
      nuxt.options.build.transpile = [];
    const transpileList = ["defu", "@vueuse/motion", "@vueuse/shared", "@vueuse/core"];
    transpileList.forEach((pkgName) => {
      if (!nuxt.options.build.transpile.includes(pkgName))
        nuxt.options.build.transpile.push(pkgName);
    });
  }
});

module.exports = module$1;
