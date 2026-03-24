"use strict";
(() => {
  // node_modules/preact/dist/preact.module.js
  var n;
  var l;
  var u;
  var t;
  var i;
  var r;
  var o;
  var e;
  var f;
  var c;
  var s;
  var a;
  var h;
  var p = {};
  var v = [];
  var y = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
  var d = Array.isArray;
  function w(n2, l3) {
    for (var u4 in l3) n2[u4] = l3[u4];
    return n2;
  }
  function g(n2) {
    n2 && n2.parentNode && n2.parentNode.removeChild(n2);
  }
  function _(l3, u4, t3) {
    var i3, r3, o3, e3 = {};
    for (o3 in u4) "key" == o3 ? i3 = u4[o3] : "ref" == o3 ? r3 = u4[o3] : e3[o3] = u4[o3];
    if (arguments.length > 2 && (e3.children = arguments.length > 3 ? n.call(arguments, 2) : t3), "function" == typeof l3 && null != l3.defaultProps) for (o3 in l3.defaultProps) void 0 === e3[o3] && (e3[o3] = l3.defaultProps[o3]);
    return m(l3, e3, i3, r3, null);
  }
  function m(n2, t3, i3, r3, o3) {
    var e3 = { type: n2, props: t3, key: i3, ref: r3, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: null == o3 ? ++u : o3, __i: -1, __u: 0 };
    return null == o3 && null != l.vnode && l.vnode(e3), e3;
  }
  function k(n2) {
    return n2.children;
  }
  function x(n2, l3) {
    this.props = n2, this.context = l3;
  }
  function S(n2, l3) {
    if (null == l3) return n2.__ ? S(n2.__, n2.__i + 1) : null;
    for (var u4; l3 < n2.__k.length; l3++) if (null != (u4 = n2.__k[l3]) && null != u4.__e) return u4.__e;
    return "function" == typeof n2.type ? S(n2) : null;
  }
  function C(n2) {
    if (n2.__P && n2.__d) {
      var u4 = n2.__v, t3 = u4.__e, i3 = [], r3 = [], o3 = w({}, u4);
      o3.__v = u4.__v + 1, l.vnode && l.vnode(o3), z(n2.__P, o3, u4, n2.__n, n2.__P.namespaceURI, 32 & u4.__u ? [t3] : null, i3, null == t3 ? S(u4) : t3, !!(32 & u4.__u), r3), o3.__v = u4.__v, o3.__.__k[o3.__i] = o3, V(i3, o3, r3), u4.__e = u4.__ = null, o3.__e != t3 && M(o3);
    }
  }
  function M(n2) {
    if (null != (n2 = n2.__) && null != n2.__c) return n2.__e = n2.__c.base = null, n2.__k.some(function(l3) {
      if (null != l3 && null != l3.__e) return n2.__e = n2.__c.base = l3.__e;
    }), M(n2);
  }
  function $(n2) {
    (!n2.__d && (n2.__d = true) && i.push(n2) && !I.__r++ || r != l.debounceRendering) && ((r = l.debounceRendering) || o)(I);
  }
  function I() {
    try {
      for (var n2, l3 = 1; i.length; ) i.length > l3 && i.sort(e), n2 = i.shift(), l3 = i.length, C(n2);
    } finally {
      i.length = I.__r = 0;
    }
  }
  function P(n2, l3, u4, t3, i3, r3, o3, e3, f4, c3, s3) {
    var a3, h4, y3, d3, w3, g2, _2, m3 = t3 && t3.__k || v, b = l3.length;
    for (f4 = A(u4, l3, m3, f4, b), a3 = 0; a3 < b; a3++) null != (y3 = u4.__k[a3]) && (h4 = -1 != y3.__i && m3[y3.__i] || p, y3.__i = a3, g2 = z(n2, y3, h4, i3, r3, o3, e3, f4, c3, s3), d3 = y3.__e, y3.ref && h4.ref != y3.ref && (h4.ref && D(h4.ref, null, y3), s3.push(y3.ref, y3.__c || d3, y3)), null == w3 && null != d3 && (w3 = d3), (_2 = !!(4 & y3.__u)) || h4.__k === y3.__k ? f4 = H(y3, f4, n2, _2) : "function" == typeof y3.type && void 0 !== g2 ? f4 = g2 : d3 && (f4 = d3.nextSibling), y3.__u &= -7);
    return u4.__e = w3, f4;
  }
  function A(n2, l3, u4, t3, i3) {
    var r3, o3, e3, f4, c3, s3 = u4.length, a3 = s3, h4 = 0;
    for (n2.__k = new Array(i3), r3 = 0; r3 < i3; r3++) null != (o3 = l3[r3]) && "boolean" != typeof o3 && "function" != typeof o3 ? ("string" == typeof o3 || "number" == typeof o3 || "bigint" == typeof o3 || o3.constructor == String ? o3 = n2.__k[r3] = m(null, o3, null, null, null) : d(o3) ? o3 = n2.__k[r3] = m(k, { children: o3 }, null, null, null) : void 0 === o3.constructor && o3.__b > 0 ? o3 = n2.__k[r3] = m(o3.type, o3.props, o3.key, o3.ref ? o3.ref : null, o3.__v) : n2.__k[r3] = o3, f4 = r3 + h4, o3.__ = n2, o3.__b = n2.__b + 1, e3 = null, -1 != (c3 = o3.__i = T(o3, u4, f4, a3)) && (a3--, (e3 = u4[c3]) && (e3.__u |= 2)), null == e3 || null == e3.__v ? (-1 == c3 && (i3 > s3 ? h4-- : i3 < s3 && h4++), "function" != typeof o3.type && (o3.__u |= 4)) : c3 != f4 && (c3 == f4 - 1 ? h4-- : c3 == f4 + 1 ? h4++ : (c3 > f4 ? h4-- : h4++, o3.__u |= 4))) : n2.__k[r3] = null;
    if (a3) for (r3 = 0; r3 < s3; r3++) null != (e3 = u4[r3]) && 0 == (2 & e3.__u) && (e3.__e == t3 && (t3 = S(e3)), E(e3, e3));
    return t3;
  }
  function H(n2, l3, u4, t3) {
    var i3, r3;
    if ("function" == typeof n2.type) {
      for (i3 = n2.__k, r3 = 0; i3 && r3 < i3.length; r3++) i3[r3] && (i3[r3].__ = n2, l3 = H(i3[r3], l3, u4, t3));
      return l3;
    }
    n2.__e != l3 && (t3 && (l3 && n2.type && !l3.parentNode && (l3 = S(n2)), u4.insertBefore(n2.__e, l3 || null)), l3 = n2.__e);
    do {
      l3 = l3 && l3.nextSibling;
    } while (null != l3 && 8 == l3.nodeType);
    return l3;
  }
  function T(n2, l3, u4, t3) {
    var i3, r3, o3, e3 = n2.key, f4 = n2.type, c3 = l3[u4], s3 = null != c3 && 0 == (2 & c3.__u);
    if (null === c3 && null == e3 || s3 && e3 == c3.key && f4 == c3.type) return u4;
    if (t3 > (s3 ? 1 : 0)) {
      for (i3 = u4 - 1, r3 = u4 + 1; i3 >= 0 || r3 < l3.length; ) if (null != (c3 = l3[o3 = i3 >= 0 ? i3-- : r3++]) && 0 == (2 & c3.__u) && e3 == c3.key && f4 == c3.type) return o3;
    }
    return -1;
  }
  function j(n2, l3, u4) {
    "-" == l3[0] ? n2.setProperty(l3, null == u4 ? "" : u4) : n2[l3] = null == u4 ? "" : "number" != typeof u4 || y.test(l3) ? u4 : u4 + "px";
  }
  function F(n2, l3, u4, t3, i3) {
    var r3, o3;
    n: if ("style" == l3) if ("string" == typeof u4) n2.style.cssText = u4;
    else {
      if ("string" == typeof t3 && (n2.style.cssText = t3 = ""), t3) for (l3 in t3) u4 && l3 in u4 || j(n2.style, l3, "");
      if (u4) for (l3 in u4) t3 && u4[l3] == t3[l3] || j(n2.style, l3, u4[l3]);
    }
    else if ("o" == l3[0] && "n" == l3[1]) r3 = l3 != (l3 = l3.replace(f, "$1")), o3 = l3.toLowerCase(), l3 = o3 in n2 || "onFocusOut" == l3 || "onFocusIn" == l3 ? o3.slice(2) : l3.slice(2), n2.l || (n2.l = {}), n2.l[l3 + r3] = u4, u4 ? t3 ? u4.u = t3.u : (u4.u = c, n2.addEventListener(l3, r3 ? a : s, r3)) : n2.removeEventListener(l3, r3 ? a : s, r3);
    else {
      if ("http://www.w3.org/2000/svg" == i3) l3 = l3.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
      else if ("width" != l3 && "height" != l3 && "href" != l3 && "list" != l3 && "form" != l3 && "tabIndex" != l3 && "download" != l3 && "rowSpan" != l3 && "colSpan" != l3 && "role" != l3 && "popover" != l3 && l3 in n2) try {
        n2[l3] = null == u4 ? "" : u4;
        break n;
      } catch (n3) {
      }
      "function" == typeof u4 || (null == u4 || false === u4 && "-" != l3[4] ? n2.removeAttribute(l3) : n2.setAttribute(l3, "popover" == l3 && 1 == u4 ? "" : u4));
    }
  }
  function O(n2) {
    return function(u4) {
      if (this.l) {
        var t3 = this.l[u4.type + n2];
        if (null == u4.t) u4.t = c++;
        else if (u4.t < t3.u) return;
        return t3(l.event ? l.event(u4) : u4);
      }
    };
  }
  function z(n2, u4, t3, i3, r3, o3, e3, f4, c3, s3) {
    var a3, h4, p3, y3, _2, m3, b, S2, C3, M2, $2, I2, A2, H2, L, T3 = u4.type;
    if (void 0 !== u4.constructor) return null;
    128 & t3.__u && (c3 = !!(32 & t3.__u), o3 = [f4 = u4.__e = t3.__e]), (a3 = l.__b) && a3(u4);
    n: if ("function" == typeof T3) try {
      if (S2 = u4.props, C3 = T3.prototype && T3.prototype.render, M2 = (a3 = T3.contextType) && i3[a3.__c], $2 = a3 ? M2 ? M2.props.value : a3.__ : i3, t3.__c ? b = (h4 = u4.__c = t3.__c).__ = h4.__E : (C3 ? u4.__c = h4 = new T3(S2, $2) : (u4.__c = h4 = new x(S2, $2), h4.constructor = T3, h4.render = G), M2 && M2.sub(h4), h4.state || (h4.state = {}), h4.__n = i3, p3 = h4.__d = true, h4.__h = [], h4._sb = []), C3 && null == h4.__s && (h4.__s = h4.state), C3 && null != T3.getDerivedStateFromProps && (h4.__s == h4.state && (h4.__s = w({}, h4.__s)), w(h4.__s, T3.getDerivedStateFromProps(S2, h4.__s))), y3 = h4.props, _2 = h4.state, h4.__v = u4, p3) C3 && null == T3.getDerivedStateFromProps && null != h4.componentWillMount && h4.componentWillMount(), C3 && null != h4.componentDidMount && h4.__h.push(h4.componentDidMount);
      else {
        if (C3 && null == T3.getDerivedStateFromProps && S2 !== y3 && null != h4.componentWillReceiveProps && h4.componentWillReceiveProps(S2, $2), u4.__v == t3.__v || !h4.__e && null != h4.shouldComponentUpdate && false === h4.shouldComponentUpdate(S2, h4.__s, $2)) {
          u4.__v != t3.__v && (h4.props = S2, h4.state = h4.__s, h4.__d = false), u4.__e = t3.__e, u4.__k = t3.__k, u4.__k.some(function(n3) {
            n3 && (n3.__ = u4);
          }), v.push.apply(h4.__h, h4._sb), h4._sb = [], h4.__h.length && e3.push(h4);
          break n;
        }
        null != h4.componentWillUpdate && h4.componentWillUpdate(S2, h4.__s, $2), C3 && null != h4.componentDidUpdate && h4.__h.push(function() {
          h4.componentDidUpdate(y3, _2, m3);
        });
      }
      if (h4.context = $2, h4.props = S2, h4.__P = n2, h4.__e = false, I2 = l.__r, A2 = 0, C3) h4.state = h4.__s, h4.__d = false, I2 && I2(u4), a3 = h4.render(h4.props, h4.state, h4.context), v.push.apply(h4.__h, h4._sb), h4._sb = [];
      else do {
        h4.__d = false, I2 && I2(u4), a3 = h4.render(h4.props, h4.state, h4.context), h4.state = h4.__s;
      } while (h4.__d && ++A2 < 25);
      h4.state = h4.__s, null != h4.getChildContext && (i3 = w(w({}, i3), h4.getChildContext())), C3 && !p3 && null != h4.getSnapshotBeforeUpdate && (m3 = h4.getSnapshotBeforeUpdate(y3, _2)), H2 = null != a3 && a3.type === k && null == a3.key ? q(a3.props.children) : a3, f4 = P(n2, d(H2) ? H2 : [H2], u4, t3, i3, r3, o3, e3, f4, c3, s3), h4.base = u4.__e, u4.__u &= -161, h4.__h.length && e3.push(h4), b && (h4.__E = h4.__ = null);
    } catch (n3) {
      if (u4.__v = null, c3 || null != o3) if (n3.then) {
        for (u4.__u |= c3 ? 160 : 128; f4 && 8 == f4.nodeType && f4.nextSibling; ) f4 = f4.nextSibling;
        o3[o3.indexOf(f4)] = null, u4.__e = f4;
      } else {
        for (L = o3.length; L--; ) g(o3[L]);
        N(u4);
      }
      else u4.__e = t3.__e, u4.__k = t3.__k, n3.then || N(u4);
      l.__e(n3, u4, t3);
    }
    else null == o3 && u4.__v == t3.__v ? (u4.__k = t3.__k, u4.__e = t3.__e) : f4 = u4.__e = B(t3.__e, u4, t3, i3, r3, o3, e3, c3, s3);
    return (a3 = l.diffed) && a3(u4), 128 & u4.__u ? void 0 : f4;
  }
  function N(n2) {
    n2 && (n2.__c && (n2.__c.__e = true), n2.__k && n2.__k.some(N));
  }
  function V(n2, u4, t3) {
    for (var i3 = 0; i3 < t3.length; i3++) D(t3[i3], t3[++i3], t3[++i3]);
    l.__c && l.__c(u4, n2), n2.some(function(u5) {
      try {
        n2 = u5.__h, u5.__h = [], n2.some(function(n3) {
          n3.call(u5);
        });
      } catch (n3) {
        l.__e(n3, u5.__v);
      }
    });
  }
  function q(n2) {
    return "object" != typeof n2 || null == n2 || n2.__b > 0 ? n2 : d(n2) ? n2.map(q) : w({}, n2);
  }
  function B(u4, t3, i3, r3, o3, e3, f4, c3, s3) {
    var a3, h4, v3, y3, w3, _2, m3, b = i3.props || p, k3 = t3.props, x2 = t3.type;
    if ("svg" == x2 ? o3 = "http://www.w3.org/2000/svg" : "math" == x2 ? o3 = "http://www.w3.org/1998/Math/MathML" : o3 || (o3 = "http://www.w3.org/1999/xhtml"), null != e3) {
      for (a3 = 0; a3 < e3.length; a3++) if ((w3 = e3[a3]) && "setAttribute" in w3 == !!x2 && (x2 ? w3.localName == x2 : 3 == w3.nodeType)) {
        u4 = w3, e3[a3] = null;
        break;
      }
    }
    if (null == u4) {
      if (null == x2) return document.createTextNode(k3);
      u4 = document.createElementNS(o3, x2, k3.is && k3), c3 && (l.__m && l.__m(t3, e3), c3 = false), e3 = null;
    }
    if (null == x2) b === k3 || c3 && u4.data == k3 || (u4.data = k3);
    else {
      if (e3 = e3 && n.call(u4.childNodes), !c3 && null != e3) for (b = {}, a3 = 0; a3 < u4.attributes.length; a3++) b[(w3 = u4.attributes[a3]).name] = w3.value;
      for (a3 in b) w3 = b[a3], "dangerouslySetInnerHTML" == a3 ? v3 = w3 : "children" == a3 || a3 in k3 || "value" == a3 && "defaultValue" in k3 || "checked" == a3 && "defaultChecked" in k3 || F(u4, a3, null, w3, o3);
      for (a3 in k3) w3 = k3[a3], "children" == a3 ? y3 = w3 : "dangerouslySetInnerHTML" == a3 ? h4 = w3 : "value" == a3 ? _2 = w3 : "checked" == a3 ? m3 = w3 : c3 && "function" != typeof w3 || b[a3] === w3 || F(u4, a3, w3, b[a3], o3);
      if (h4) c3 || v3 && (h4.__html == v3.__html || h4.__html == u4.innerHTML) || (u4.innerHTML = h4.__html), t3.__k = [];
      else if (v3 && (u4.innerHTML = ""), P("template" == t3.type ? u4.content : u4, d(y3) ? y3 : [y3], t3, i3, r3, "foreignObject" == x2 ? "http://www.w3.org/1999/xhtml" : o3, e3, f4, e3 ? e3[0] : i3.__k && S(i3, 0), c3, s3), null != e3) for (a3 = e3.length; a3--; ) g(e3[a3]);
      c3 || (a3 = "value", "progress" == x2 && null == _2 ? u4.removeAttribute("value") : null != _2 && (_2 !== u4[a3] || "progress" == x2 && !_2 || "option" == x2 && _2 != b[a3]) && F(u4, a3, _2, b[a3], o3), a3 = "checked", null != m3 && m3 != u4[a3] && F(u4, a3, m3, b[a3], o3));
    }
    return u4;
  }
  function D(n2, u4, t3) {
    try {
      if ("function" == typeof n2) {
        var i3 = "function" == typeof n2.__u;
        i3 && n2.__u(), i3 && null == u4 || (n2.__u = n2(u4));
      } else n2.current = u4;
    } catch (n3) {
      l.__e(n3, t3);
    }
  }
  function E(n2, u4, t3) {
    var i3, r3;
    if (l.unmount && l.unmount(n2), (i3 = n2.ref) && (i3.current && i3.current != n2.__e || D(i3, null, u4)), null != (i3 = n2.__c)) {
      if (i3.componentWillUnmount) try {
        i3.componentWillUnmount();
      } catch (n3) {
        l.__e(n3, u4);
      }
      i3.base = i3.__P = null;
    }
    if (i3 = n2.__k) for (r3 = 0; r3 < i3.length; r3++) i3[r3] && E(i3[r3], u4, t3 || "function" != typeof n2.type);
    t3 || g(n2.__e), n2.__c = n2.__ = n2.__e = void 0;
  }
  function G(n2, l3, u4) {
    return this.constructor(n2, u4);
  }
  function J(u4, t3, i3) {
    var r3, o3, e3, f4;
    t3 == document && (t3 = document.documentElement), l.__ && l.__(u4, t3), o3 = (r3 = "function" == typeof i3) ? null : i3 && i3.__k || t3.__k, e3 = [], f4 = [], z(t3, u4 = (!r3 && i3 || t3).__k = _(k, null, [u4]), o3 || p, p, t3.namespaceURI, !r3 && i3 ? [i3] : o3 ? null : t3.firstChild ? n.call(t3.childNodes) : null, e3, !r3 && i3 ? i3 : o3 ? o3.__e : t3.firstChild, r3, f4), V(e3, u4, f4);
  }
  n = v.slice, l = { __e: function(n2, l3, u4, t3) {
    for (var i3, r3, o3; l3 = l3.__; ) if ((i3 = l3.__c) && !i3.__) try {
      if ((r3 = i3.constructor) && null != r3.getDerivedStateFromError && (i3.setState(r3.getDerivedStateFromError(n2)), o3 = i3.__d), null != i3.componentDidCatch && (i3.componentDidCatch(n2, t3 || {}), o3 = i3.__d), o3) return i3.__E = i3;
    } catch (l4) {
      n2 = l4;
    }
    throw n2;
  } }, u = 0, t = function(n2) {
    return null != n2 && void 0 === n2.constructor;
  }, x.prototype.setState = function(n2, l3) {
    var u4;
    u4 = null != this.__s && this.__s != this.state ? this.__s : this.__s = w({}, this.state), "function" == typeof n2 && (n2 = n2(w({}, u4), this.props)), n2 && w(u4, n2), null != n2 && this.__v && (l3 && this._sb.push(l3), $(this));
  }, x.prototype.forceUpdate = function(n2) {
    this.__v && (this.__e = true, n2 && this.__h.push(n2), $(this));
  }, x.prototype.render = k, i = [], o = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, e = function(n2, l3) {
    return n2.__v.__b - l3.__v.__b;
  }, I.__r = 0, f = /(PointerCapture)$|Capture$/i, c = 0, s = O(false), a = O(true), h = 0;

  // node_modules/preact/hooks/dist/hooks.module.js
  var t2;
  var r2;
  var u2;
  var i2;
  var o2 = 0;
  var f2 = [];
  var c2 = l;
  var e2 = c2.__b;
  var a2 = c2.__r;
  var v2 = c2.diffed;
  var l2 = c2.__c;
  var m2 = c2.unmount;
  var s2 = c2.__;
  function p2(n2, t3) {
    c2.__h && c2.__h(r2, n2, o2 || t3), o2 = 0;
    var u4 = r2.__H || (r2.__H = { __: [], __h: [] });
    return n2 >= u4.__.length && u4.__.push({}), u4.__[n2];
  }
  function d2(n2) {
    return o2 = 1, h2(D2, n2);
  }
  function h2(n2, u4, i3) {
    var o3 = p2(t2++, 2);
    if (o3.t = n2, !o3.__c && (o3.__ = [i3 ? i3(u4) : D2(void 0, u4), function(n3) {
      var t3 = o3.__N ? o3.__N[0] : o3.__[0], r3 = o3.t(t3, n3);
      t3 !== r3 && (o3.__N = [r3, o3.__[1]], o3.__c.setState({}));
    }], o3.__c = r2, !r2.__f)) {
      var f4 = function(n3, t3, r3) {
        if (!o3.__c.__H) return true;
        var u5 = o3.__c.__H.__.filter(function(n4) {
          return n4.__c;
        });
        if (u5.every(function(n4) {
          return !n4.__N;
        })) return !c3 || c3.call(this, n3, t3, r3);
        var i4 = o3.__c.props !== n3;
        return u5.some(function(n4) {
          if (n4.__N) {
            var t4 = n4.__[0];
            n4.__ = n4.__N, n4.__N = void 0, t4 !== n4.__[0] && (i4 = true);
          }
        }), c3 && c3.call(this, n3, t3, r3) || i4;
      };
      r2.__f = true;
      var c3 = r2.shouldComponentUpdate, e3 = r2.componentWillUpdate;
      r2.componentWillUpdate = function(n3, t3, r3) {
        if (this.__e) {
          var u5 = c3;
          c3 = void 0, f4(n3, t3, r3), c3 = u5;
        }
        e3 && e3.call(this, n3, t3, r3);
      }, r2.shouldComponentUpdate = f4;
    }
    return o3.__N || o3.__;
  }
  function y2(n2, u4) {
    var i3 = p2(t2++, 3);
    !c2.__s && C2(i3.__H, u4) && (i3.__ = n2, i3.u = u4, r2.__H.__h.push(i3));
  }
  function T2(n2, r3) {
    var u4 = p2(t2++, 7);
    return C2(u4.__H, r3) && (u4.__ = n2(), u4.__H = r3, u4.__h = n2), u4.__;
  }
  function q2(n2, t3) {
    return o2 = 8, T2(function() {
      return n2;
    }, t3);
  }
  function j2() {
    for (var n2; n2 = f2.shift(); ) {
      var t3 = n2.__H;
      if (n2.__P && t3) try {
        t3.__h.some(z2), t3.__h.some(B2), t3.__h = [];
      } catch (r3) {
        t3.__h = [], c2.__e(r3, n2.__v);
      }
    }
  }
  c2.__b = function(n2) {
    r2 = null, e2 && e2(n2);
  }, c2.__ = function(n2, t3) {
    n2 && t3.__k && t3.__k.__m && (n2.__m = t3.__k.__m), s2 && s2(n2, t3);
  }, c2.__r = function(n2) {
    a2 && a2(n2), t2 = 0;
    var i3 = (r2 = n2.__c).__H;
    i3 && (u2 === r2 ? (i3.__h = [], r2.__h = [], i3.__.some(function(n3) {
      n3.__N && (n3.__ = n3.__N), n3.u = n3.__N = void 0;
    })) : (i3.__h.some(z2), i3.__h.some(B2), i3.__h = [], t2 = 0)), u2 = r2;
  }, c2.diffed = function(n2) {
    v2 && v2(n2);
    var t3 = n2.__c;
    t3 && t3.__H && (t3.__H.__h.length && (1 !== f2.push(t3) && i2 === c2.requestAnimationFrame || ((i2 = c2.requestAnimationFrame) || w2)(j2)), t3.__H.__.some(function(n3) {
      n3.u && (n3.__H = n3.u), n3.u = void 0;
    })), u2 = r2 = null;
  }, c2.__c = function(n2, t3) {
    t3.some(function(n3) {
      try {
        n3.__h.some(z2), n3.__h = n3.__h.filter(function(n4) {
          return !n4.__ || B2(n4);
        });
      } catch (r3) {
        t3.some(function(n4) {
          n4.__h && (n4.__h = []);
        }), t3 = [], c2.__e(r3, n3.__v);
      }
    }), l2 && l2(n2, t3);
  }, c2.unmount = function(n2) {
    m2 && m2(n2);
    var t3, r3 = n2.__c;
    r3 && r3.__H && (r3.__H.__.some(function(n3) {
      try {
        z2(n3);
      } catch (n4) {
        t3 = n4;
      }
    }), r3.__H = void 0, t3 && c2.__e(t3, r3.__v));
  };
  var k2 = "function" == typeof requestAnimationFrame;
  function w2(n2) {
    var t3, r3 = function() {
      clearTimeout(u4), k2 && cancelAnimationFrame(t3), setTimeout(n2);
    }, u4 = setTimeout(r3, 35);
    k2 && (t3 = requestAnimationFrame(r3));
  }
  function z2(n2) {
    var t3 = r2, u4 = n2.__c;
    "function" == typeof u4 && (n2.__c = void 0, u4()), r2 = t3;
  }
  function B2(n2) {
    var t3 = r2;
    n2.__c = n2.__(), r2 = t3;
  }
  function C2(n2, t3) {
    return !n2 || n2.length !== t3.length || t3.some(function(t4, r3) {
      return t4 !== n2[r3];
    });
  }
  function D2(n2, t3) {
    return "function" == typeof t3 ? t3(n2) : t3;
  }

  // node_modules/preact/jsx-runtime/dist/jsxRuntime.module.js
  var f3 = 0;
  function u3(e3, t3, n2, o3, i3, u4) {
    t3 || (t3 = {});
    var a3, c3, p3 = t3;
    if ("ref" in p3) for (c3 in p3 = {}, t3) "ref" == c3 ? a3 = t3[c3] : p3[c3] = t3[c3];
    var l3 = { type: e3, props: p3, key: n2, ref: a3, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: --f3, __i: -1, __u: 0, __source: i3, __self: u4 };
    if ("function" == typeof e3 && (a3 = e3.defaultProps)) for (c3 in a3) void 0 === p3[c3] && (p3[c3] = a3[c3]);
    return l.vnode && l.vnode(l3), l3;
  }

  // src/frontend/app.tsx
  var BASE = window.INGRESS_PATH || "";
  async function fetchStatus() {
    const res = await fetch(`${BASE}/api/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  async function fetchConfig() {
    const res = await fetch(`${BASE}/api/config`);
    return res.json();
  }
  async function saveConfig(config) {
    const res = await fetch(`${BASE}/api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config)
    });
    const result = await res.json();
    return result.success;
  }
  function Badge({ variant, children }) {
    return /* @__PURE__ */ u3("span", { class: `badge badge-${variant}`, children });
  }
  function Card({ title, children }) {
    return /* @__PURE__ */ u3("div", { class: "card", children: [
      title && /* @__PURE__ */ u3("div", { class: "card-header", children: title }),
      /* @__PURE__ */ u3("div", { class: "card-body", children })
    ] });
  }
  function SlotTable({ slots }) {
    if (!slots || slots.length === 0) {
      return /* @__PURE__ */ u3("p", { class: "text-muted", children: "No available courts found matching your preferences." });
    }
    const byDate = {};
    for (const slot of slots) {
      if (!byDate[slot.date]) byDate[slot.date] = [];
      byDate[slot.date].push(slot);
    }
    return /* @__PURE__ */ u3("div", { children: Object.entries(byDate).sort().map(([date, dateSlots]) => /* @__PURE__ */ u3(Card, { title: formatDate(date), children: /* @__PURE__ */ u3("table", { children: [
      /* @__PURE__ */ u3("thead", { children: /* @__PURE__ */ u3("tr", { children: [
        /* @__PURE__ */ u3("th", { children: "Court" }),
        /* @__PURE__ */ u3("th", { children: "Time" }),
        /* @__PURE__ */ u3("th", { children: "Duration" }),
        /* @__PURE__ */ u3("th", { children: "Provider" })
      ] }) }),
      /* @__PURE__ */ u3("tbody", { children: dateSlots.sort((a3, b) => a3.startTime.localeCompare(b.startTime)).map((s3, i3) => /* @__PURE__ */ u3("tr", { children: [
        /* @__PURE__ */ u3("td", { children: s3.courtName }),
        /* @__PURE__ */ u3("td", { class: "text-mono", children: [
          s3.startTime,
          " \u2013 ",
          s3.endTime
        ] }),
        /* @__PURE__ */ u3("td", { children: [
          s3.durationMinutes,
          " min"
        ] }),
        /* @__PURE__ */ u3("td", { children: /* @__PURE__ */ u3(Badge, { variant: "default", children: s3.provider }) })
      ] }, i3)) })
    ] }) }, date)) });
  }
  function formatDate(dateStr) {
    const d3 = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
    return d3.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  }
  function Toggle({ label, checked, onChange }) {
    return /* @__PURE__ */ u3("label", { class: "toggle-row", children: [
      /* @__PURE__ */ u3("span", { children: label }),
      /* @__PURE__ */ u3(
        "button",
        {
          type: "button",
          class: `toggle ${checked ? "toggle-on" : ""}`,
          onClick: () => onChange(!checked),
          role: "switch",
          "aria-checked": checked,
          children: /* @__PURE__ */ u3("span", { class: "toggle-knob" })
        }
      )
    ] });
  }
  function Field({ label, children }) {
    return /* @__PURE__ */ u3("div", { class: "field", children: [
      /* @__PURE__ */ u3("label", { class: "field-label", children: label }),
      children
    ] });
  }
  function DatePicker({ selected, onChange }) {
    const days = [];
    const now = /* @__PURE__ */ new Date();
    for (let i3 = 1; i3 <= 14; i3++) {
      const d3 = new Date(now);
      d3.setDate(d3.getDate() + i3);
      const iso = d3.toISOString().slice(0, 10);
      days.push({
        date: iso,
        label: d3.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        weekday: d3.toLocaleDateString("en-US", { weekday: "short" })
      });
    }
    const toggle = (date) => {
      if (selected.includes(date)) {
        onChange(selected.filter((d3) => d3 !== date));
      } else {
        onChange([...selected, date].sort());
      }
    };
    const isWeekend = (date) => {
      const d3 = /* @__PURE__ */ new Date(date + "T00:00:00");
      return d3.getDay() === 0 || d3.getDay() === 6;
    };
    return /* @__PURE__ */ u3("div", { children: [
      /* @__PURE__ */ u3("div", { class: "date-picker-grid", children: days.map((d3) => /* @__PURE__ */ u3(
        "button",
        {
          type: "button",
          class: `date-chip ${selected.includes(d3.date) ? "date-chip-selected" : ""} ${isWeekend(d3.date) ? "date-chip-weekend" : ""}`,
          onClick: () => toggle(d3.date),
          children: [
            /* @__PURE__ */ u3("span", { class: "date-chip-weekday", children: d3.weekday }),
            /* @__PURE__ */ u3("span", { class: "date-chip-date", children: d3.label })
          ]
        },
        d3.date
      )) }),
      /* @__PURE__ */ u3("p", { class: "text-muted", style: { fontSize: "0.75rem", marginTop: "8px" }, children: selected.length === 0 ? "No dates selected \u2014 scanning next 7 days automatically" : `${selected.length} date(s) selected` })
    ] });
  }
  function SettingsPanel() {
    const [config, setConfig] = d2(null);
    const [saving, setSaving] = d2(false);
    const [saveResult, setSaveResult] = d2(null);
    y2(() => {
      fetchConfig().then(setConfig).catch(console.error);
    }, []);
    const update = q2((key, value) => {
      setConfig((prev) => prev ? { ...prev, [key]: value } : prev);
    }, []);
    const handleSave = async () => {
      if (!config) return;
      setSaving(true);
      setSaveResult(null);
      try {
        const ok = await saveConfig(config);
        setSaveResult(ok ? "ok" : "error");
      } catch {
        setSaveResult("error");
      }
      setSaving(false);
      setTimeout(() => setSaveResult(null), 3e3);
    };
    if (!config) return /* @__PURE__ */ u3("p", { class: "text-muted", children: "Loading settings..." });
    return /* @__PURE__ */ u3("div", { class: "settings", children: [
      /* @__PURE__ */ u3(Card, { title: "Dates to Scan", children: /* @__PURE__ */ u3(
        DatePicker,
        {
          selected: config.scan_dates ?? [],
          onChange: (dates) => update("scan_dates", dates)
        }
      ) }),
      /* @__PURE__ */ u3(Card, { title: "General", children: /* @__PURE__ */ u3("div", { class: "field-grid", children: [
        /* @__PURE__ */ u3(Field, { label: "Poll Interval (seconds)", children: /* @__PURE__ */ u3(
          "input",
          {
            type: "number",
            min: "10",
            max: "3600",
            value: config.poll_interval_seconds,
            onInput: (e3) => update("poll_interval_seconds", +e3.target.value)
          }
        ) }),
        /* @__PURE__ */ u3(Field, { label: "Preferred Start Time", children: /* @__PURE__ */ u3(
          "input",
          {
            type: "time",
            value: config.preferred_start_time,
            onInput: (e3) => update("preferred_start_time", e3.target.value)
          }
        ) }),
        /* @__PURE__ */ u3(Field, { label: "Preferred End Time", children: /* @__PURE__ */ u3(
          "input",
          {
            type: "time",
            value: config.preferred_end_time,
            onInput: (e3) => update("preferred_end_time", e3.target.value)
          }
        ) }),
        /* @__PURE__ */ u3(Field, { label: "Min Duration (minutes)", children: /* @__PURE__ */ u3(
          "input",
          {
            type: "number",
            min: "30",
            max: "180",
            step: "30",
            value: config.preferred_duration_minutes,
            onInput: (e3) => update("preferred_duration_minutes", +e3.target.value)
          }
        ) }),
        /* @__PURE__ */ u3(Field, { label: "Notify Device", children: /* @__PURE__ */ u3(
          "input",
          {
            type: "text",
            placeholder: "e.g. iphone",
            value: config.notify_device,
            onInput: (e3) => update("notify_device", e3.target.value)
          }
        ) })
      ] }) }),
      /* @__PURE__ */ u3(Card, { title: "Teniso Pasaulis", children: [
        /* @__PURE__ */ u3(
          Toggle,
          {
            label: "Enabled",
            checked: config.teniso_pasaulis_enabled,
            onChange: (v3) => update("teniso_pasaulis_enabled", v3)
          }
        ),
        config.teniso_pasaulis_enabled && /* @__PURE__ */ u3("div", { class: "field-grid", style: { marginTop: "12px" }, children: [
          /* @__PURE__ */ u3(Field, { label: "Session Token", children: /* @__PURE__ */ u3(
            "input",
            {
              type: "password",
              autocomplete: "off",
              value: config.teniso_pasaulis_session_token,
              onInput: (e3) => update("teniso_pasaulis_session_token", e3.target.value)
            }
          ) }),
          /* @__PURE__ */ u3(Field, { label: "Sale Point", children: /* @__PURE__ */ u3(
            "input",
            {
              type: "number",
              min: "1",
              value: config.teniso_pasaulis_sale_point,
              onInput: (e3) => update("teniso_pasaulis_sale_point", +e3.target.value)
            }
          ) }),
          /* @__PURE__ */ u3(Field, { label: "Court IDs (comma-separated, empty = all)", children: /* @__PURE__ */ u3(
            "input",
            {
              type: "text",
              placeholder: "e.g. 2, 5, 8",
              value: config.teniso_pasaulis_places,
              onInput: (e3) => update("teniso_pasaulis_places", e3.target.value)
            }
          ) })
        ] })
      ] }),
      /* @__PURE__ */ u3(Card, { title: "Baltic Tennis", children: [
        /* @__PURE__ */ u3(
          Toggle,
          {
            label: "Enabled",
            checked: config.baltic_tennis_enabled,
            onChange: (v3) => update("baltic_tennis_enabled", v3)
          }
        ),
        config.baltic_tennis_enabled && /* @__PURE__ */ u3("div", { class: "field-grid", style: { marginTop: "12px" }, children: [
          /* @__PURE__ */ u3(Field, { label: "PHPSESSID Token", children: /* @__PURE__ */ u3(
            "input",
            {
              type: "password",
              autocomplete: "off",
              value: config.baltic_tennis_session_token,
              onInput: (e3) => update("baltic_tennis_session_token", e3.target.value)
            }
          ) }),
          /* @__PURE__ */ u3(Field, { label: "Place IDs (comma-separated)", children: /* @__PURE__ */ u3(
            "input",
            {
              type: "text",
              placeholder: "e.g. 1, 2",
              value: config.baltic_tennis_place_ids,
              onInput: (e3) => update("baltic_tennis_place_ids", e3.target.value)
            }
          ) })
        ] })
      ] }),
      /* @__PURE__ */ u3(Card, { title: "Advanced", children: /* @__PURE__ */ u3(
        Toggle,
        {
          label: "Debug Mode",
          checked: config.debug,
          onChange: (v3) => update("debug", v3)
        }
      ) }),
      /* @__PURE__ */ u3("div", { class: "save-bar", children: [
        /* @__PURE__ */ u3("button", { class: "btn-primary", onClick: handleSave, disabled: saving, children: saving ? "Saving..." : "Save Settings" }),
        saveResult === "ok" && /* @__PURE__ */ u3("span", { class: "text-success", children: "Settings saved! Changes applied." }),
        saveResult === "error" && /* @__PURE__ */ u3("span", { class: "text-error", children: "Failed to save settings." })
      ] })
    ] });
  }
  function App() {
    const [tab, setTab] = d2("courts");
    const [status, setStatus] = d2(null);
    const [error, setError] = d2(false);
    const refresh = q2(async () => {
      try {
        const data = await fetchStatus();
        setStatus(data);
        setError(false);
      } catch {
        setError(true);
      }
    }, []);
    y2(() => {
      refresh();
      const id = setInterval(refresh, 1e4);
      return () => clearInterval(id);
    }, [refresh]);
    return /* @__PURE__ */ u3("div", { class: "app", children: [
      /* @__PURE__ */ u3("header", { children: [
        /* @__PURE__ */ u3("div", { class: "header-left", children: [
          /* @__PURE__ */ u3("h1", { children: "Tennis Court Radar" }),
          error ? /* @__PURE__ */ u3(Badge, { variant: "error", children: "Error" }) : status ? /* @__PURE__ */ u3(Badge, { variant: "ok", children: "Running" }) : /* @__PURE__ */ u3(Badge, { variant: "default", children: "Loading..." })
        ] }),
        /* @__PURE__ */ u3("nav", { class: "tabs", children: [
          /* @__PURE__ */ u3("button", { class: `tab ${tab === "courts" ? "active" : ""}`, onClick: () => setTab("courts"), children: "Courts" }),
          /* @__PURE__ */ u3("button", { class: `tab ${tab === "settings" ? "active" : ""}`, onClick: () => setTab("settings"), children: "Settings" })
        ] })
      ] }),
      tab === "courts" && /* @__PURE__ */ u3("section", { children: [
        /* @__PURE__ */ u3(SlotTable, { slots: status?.availableSlots ?? [] }),
        status?.lastPoll && /* @__PURE__ */ u3("p", { class: "text-muted", style: { marginTop: "16px", fontSize: "0.8rem" }, children: [
          "Last poll: ",
          new Date(status.lastPoll).toLocaleTimeString()
        ] })
      ] }),
      tab === "settings" && /* @__PURE__ */ u3(SettingsPanel, {})
    ] });
  }
  J(/* @__PURE__ */ u3(App, {}), document.getElementById("app"));
})();
//# sourceMappingURL=app.js.map
