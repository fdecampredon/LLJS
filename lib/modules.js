"use strict";

var modules = {};
var modulesInstances = {};

function _require(name) {
  // assert (name in modules, "Module \"" + name + "\" is not loaded.");
  var module = modulesInstances[name];
  if (module) {
    return module;
  }
  return modulesInstances[name] = modules[name]();
}