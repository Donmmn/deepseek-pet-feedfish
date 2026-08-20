// Client half of deepseek-token-pet.
//
// The DSH Desktop bundle loader includes a bundle when it also has a client
// entry. This module intentionally stays minimal: it lets the desktop profile
// load the host-side `deepseek-token-pet/dsh` plugin (usage → pet bridge and
// heartbeat). Future UI can add a connection-status chip here.
window.__ModuleLoader__.load({
  id: "deepseek-token-pet",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    exports.name = "deepseek-token-pet";
    exports.inject = [];
    exports.apply = function apply() {};
    return module.exports;
  }
});
