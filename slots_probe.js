// @name Slot WebView Probe
// @description Observe fetch/XHR/WebSocket traffic
// @author Mellonelay
// @version 1.0
// @match *://*/*

(function () {

console.log("[SLOT_PROBE] loaded");

const origFetch = window.fetch;

window.fetch = async function (...args) {

console.log("[FETCH REQUEST]", args);

const res = await origFetch.apply(this, args);

console.log("[FETCH RESPONSE]", {
url: res.url,
status: res.status
});

return res;
};

const origOpen = XMLHttpRequest.prototype.open;

XMLHttpRequest.prototype.open = function (method, url) {

console.log("[XHR OPEN]", method, url);

this.addEventListener("load", function () {

console.log("[XHR RESPONSE]", {
url: url,
status: this.status,
response: this.responseText?.slice(0,300)
});

});

return origOpen.apply(this, arguments);
};

const OrigWS = window.WebSocket;

window.WebSocket = function (url, protocols) {

console.log("[WS CONNECT]", url);

const ws = new OrigWS(url, protocols);

ws.addEventListener("message", function(event) {

console.log("[WS MESSAGE]", event.data);

});

return ws;
};

})();
