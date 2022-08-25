
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop$1() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop$1;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot_base(slot, slot_definition, ctx, $$scope, slot_changes, get_slot_context_fn) {
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function get_all_dirty_from_scope($$scope) {
        if ($$scope.ctx.length > 32) {
            const dirty = [];
            const length = $$scope.ctx.length / 32;
            for (let i = 0; i < length; i++) {
                dirty[i] = -1;
            }
            return dirty;
        }
        return -1;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_svg_attributes(node, attributes) {
        for (const key in attributes) {
            attr(node, key, attributes[key]);
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_style(node, key, value, important) {
        if (value === null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
        return context;
    }
    function getContext(key) {
        return get_current_component().$$.context.get(key);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function tick() {
        schedule_update();
        return resolved_promise;
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }

    function destroy_block(block, lookup) {
        block.d(1);
        lookup.delete(block.key);
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop$1,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop$1;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function ascending$1(a, b) {
      return a == null || b == null ? NaN : a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
    }

    function descending(a, b) {
      return a == null || b == null ? NaN
        : b < a ? -1
        : b > a ? 1
        : b >= a ? 0
        : NaN;
    }

    function bisector$1(f) {
      let compare1, compare2, delta;

      // If an accessor is specified, promote it to a comparator. In this case we
      // can test whether the search value is (self-) comparable. We can’t do this
      // for a comparator (except for specific, known comparators) because we can’t
      // tell if the comparator is symmetric, and an asymmetric comparator can’t be
      // used to test whether a single value is comparable.
      if (f.length !== 2) {
        compare1 = ascending$1;
        compare2 = (d, x) => ascending$1(f(d), x);
        delta = (d, x) => f(d) - x;
      } else {
        compare1 = f === ascending$1 || f === descending ? f : zero$1;
        compare2 = f;
        delta = f;
      }

      function left(a, x, lo = 0, hi = a.length) {
        if (lo < hi) {
          if (compare1(x, x) !== 0) return hi;
          do {
            const mid = (lo + hi) >>> 1;
            if (compare2(a[mid], x) < 0) lo = mid + 1;
            else hi = mid;
          } while (lo < hi);
        }
        return lo;
      }

      function right(a, x, lo = 0, hi = a.length) {
        if (lo < hi) {
          if (compare1(x, x) !== 0) return hi;
          do {
            const mid = (lo + hi) >>> 1;
            if (compare2(a[mid], x) <= 0) lo = mid + 1;
            else hi = mid;
          } while (lo < hi);
        }
        return lo;
      }

      function center(a, x, lo = 0, hi = a.length) {
        const i = left(a, x, lo, hi - 1);
        return i > lo && delta(a[i - 1], x) > -delta(a[i], x) ? i - 1 : i;
      }

      return {left, center, right};
    }

    function zero$1() {
      return 0;
    }

    function number$1(x) {
      return x === null ? NaN : +x;
    }

    const ascendingBisect$1 = bisector$1(ascending$1);
    const bisectRight$1 = ascendingBisect$1.right;
    bisector$1(number$1).center;
    var bisect = bisectRight$1;

    class InternMap extends Map {
      constructor(entries, key = keyof) {
        super();
        Object.defineProperties(this, {_intern: {value: new Map()}, _key: {value: key}});
        if (entries != null) for (const [key, value] of entries) this.set(key, value);
      }
      get(key) {
        return super.get(intern_get(this, key));
      }
      has(key) {
        return super.has(intern_get(this, key));
      }
      set(key, value) {
        return super.set(intern_set(this, key), value);
      }
      delete(key) {
        return super.delete(intern_delete(this, key));
      }
    }

    function intern_get({_intern, _key}, value) {
      const key = _key(value);
      return _intern.has(key) ? _intern.get(key) : value;
    }

    function intern_set({_intern, _key}, value) {
      const key = _key(value);
      if (_intern.has(key)) return _intern.get(key);
      _intern.set(key, value);
      return value;
    }

    function intern_delete({_intern, _key}, value) {
      const key = _key(value);
      if (_intern.has(key)) {
        value = _intern.get(key);
        _intern.delete(key);
      }
      return value;
    }

    function keyof(value) {
      return value !== null && typeof value === "object" ? value.valueOf() : value;
    }

    var e10 = Math.sqrt(50),
        e5 = Math.sqrt(10),
        e2 = Math.sqrt(2);

    function ticks(start, stop, count) {
      var reverse,
          i = -1,
          n,
          ticks,
          step;

      stop = +stop, start = +start, count = +count;
      if (start === stop && count > 0) return [start];
      if (reverse = stop < start) n = start, start = stop, stop = n;
      if ((step = tickIncrement(start, stop, count)) === 0 || !isFinite(step)) return [];

      if (step > 0) {
        let r0 = Math.round(start / step), r1 = Math.round(stop / step);
        if (r0 * step < start) ++r0;
        if (r1 * step > stop) --r1;
        ticks = new Array(n = r1 - r0 + 1);
        while (++i < n) ticks[i] = (r0 + i) * step;
      } else {
        step = -step;
        let r0 = Math.round(start * step), r1 = Math.round(stop * step);
        if (r0 / step < start) ++r0;
        if (r1 / step > stop) --r1;
        ticks = new Array(n = r1 - r0 + 1);
        while (++i < n) ticks[i] = (r0 + i) / step;
      }

      if (reverse) ticks.reverse();

      return ticks;
    }

    function tickIncrement(start, stop, count) {
      var step = (stop - start) / Math.max(0, count),
          power = Math.floor(Math.log(step) / Math.LN10),
          error = step / Math.pow(10, power);
      return power >= 0
          ? (error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1) * Math.pow(10, power)
          : -Math.pow(10, -power) / (error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1);
    }

    function tickStep(start, stop, count) {
      var step0 = Math.abs(stop - start) / Math.max(0, count),
          step1 = Math.pow(10, Math.floor(Math.log(step0) / Math.LN10)),
          error = step0 / step1;
      if (error >= e10) step1 *= 10;
      else if (error >= e5) step1 *= 5;
      else if (error >= e2) step1 *= 2;
      return stop < start ? -step1 : step1;
    }

    function initRange$1(domain, range) {
      switch (arguments.length) {
        case 0: break;
        case 1: this.range(domain); break;
        default: this.range(range).domain(domain); break;
      }
      return this;
    }

    const implicit = Symbol("implicit");

    function ordinal() {
      var index = new InternMap(),
          domain = [],
          range = [],
          unknown = implicit;

      function scale(d) {
        let i = index.get(d);
        if (i === undefined) {
          if (unknown !== implicit) return unknown;
          index.set(d, i = domain.push(d) - 1);
        }
        return range[i % range.length];
      }

      scale.domain = function(_) {
        if (!arguments.length) return domain.slice();
        domain = [], index = new InternMap();
        for (const value of _) {
          if (index.has(value)) continue;
          index.set(value, domain.push(value) - 1);
        }
        return scale;
      };

      scale.range = function(_) {
        return arguments.length ? (range = Array.from(_), scale) : range.slice();
      };

      scale.unknown = function(_) {
        return arguments.length ? (unknown = _, scale) : unknown;
      };

      scale.copy = function() {
        return ordinal(domain, range).unknown(unknown);
      };

      initRange$1.apply(scale, arguments);

      return scale;
    }

    function define(constructor, factory, prototype) {
      constructor.prototype = factory.prototype = prototype;
      prototype.constructor = constructor;
    }

    function extend$1(parent, definition) {
      var prototype = Object.create(parent.prototype);
      for (var key in definition) prototype[key] = definition[key];
      return prototype;
    }

    function Color() {}

    var darker = 0.7;
    var brighter = 1 / darker;

    var reI = "\\s*([+-]?\\d+)\\s*",
        reN = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)\\s*",
        reP = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)%\\s*",
        reHex = /^#([0-9a-f]{3,8})$/,
        reRgbInteger = new RegExp(`^rgb\\(${reI},${reI},${reI}\\)$`),
        reRgbPercent = new RegExp(`^rgb\\(${reP},${reP},${reP}\\)$`),
        reRgbaInteger = new RegExp(`^rgba\\(${reI},${reI},${reI},${reN}\\)$`),
        reRgbaPercent = new RegExp(`^rgba\\(${reP},${reP},${reP},${reN}\\)$`),
        reHslPercent = new RegExp(`^hsl\\(${reN},${reP},${reP}\\)$`),
        reHslaPercent = new RegExp(`^hsla\\(${reN},${reP},${reP},${reN}\\)$`);

    var named = {
      aliceblue: 0xf0f8ff,
      antiquewhite: 0xfaebd7,
      aqua: 0x00ffff,
      aquamarine: 0x7fffd4,
      azure: 0xf0ffff,
      beige: 0xf5f5dc,
      bisque: 0xffe4c4,
      black: 0x000000,
      blanchedalmond: 0xffebcd,
      blue: 0x0000ff,
      blueviolet: 0x8a2be2,
      brown: 0xa52a2a,
      burlywood: 0xdeb887,
      cadetblue: 0x5f9ea0,
      chartreuse: 0x7fff00,
      chocolate: 0xd2691e,
      coral: 0xff7f50,
      cornflowerblue: 0x6495ed,
      cornsilk: 0xfff8dc,
      crimson: 0xdc143c,
      cyan: 0x00ffff,
      darkblue: 0x00008b,
      darkcyan: 0x008b8b,
      darkgoldenrod: 0xb8860b,
      darkgray: 0xa9a9a9,
      darkgreen: 0x006400,
      darkgrey: 0xa9a9a9,
      darkkhaki: 0xbdb76b,
      darkmagenta: 0x8b008b,
      darkolivegreen: 0x556b2f,
      darkorange: 0xff8c00,
      darkorchid: 0x9932cc,
      darkred: 0x8b0000,
      darksalmon: 0xe9967a,
      darkseagreen: 0x8fbc8f,
      darkslateblue: 0x483d8b,
      darkslategray: 0x2f4f4f,
      darkslategrey: 0x2f4f4f,
      darkturquoise: 0x00ced1,
      darkviolet: 0x9400d3,
      deeppink: 0xff1493,
      deepskyblue: 0x00bfff,
      dimgray: 0x696969,
      dimgrey: 0x696969,
      dodgerblue: 0x1e90ff,
      firebrick: 0xb22222,
      floralwhite: 0xfffaf0,
      forestgreen: 0x228b22,
      fuchsia: 0xff00ff,
      gainsboro: 0xdcdcdc,
      ghostwhite: 0xf8f8ff,
      gold: 0xffd700,
      goldenrod: 0xdaa520,
      gray: 0x808080,
      green: 0x008000,
      greenyellow: 0xadff2f,
      grey: 0x808080,
      honeydew: 0xf0fff0,
      hotpink: 0xff69b4,
      indianred: 0xcd5c5c,
      indigo: 0x4b0082,
      ivory: 0xfffff0,
      khaki: 0xf0e68c,
      lavender: 0xe6e6fa,
      lavenderblush: 0xfff0f5,
      lawngreen: 0x7cfc00,
      lemonchiffon: 0xfffacd,
      lightblue: 0xadd8e6,
      lightcoral: 0xf08080,
      lightcyan: 0xe0ffff,
      lightgoldenrodyellow: 0xfafad2,
      lightgray: 0xd3d3d3,
      lightgreen: 0x90ee90,
      lightgrey: 0xd3d3d3,
      lightpink: 0xffb6c1,
      lightsalmon: 0xffa07a,
      lightseagreen: 0x20b2aa,
      lightskyblue: 0x87cefa,
      lightslategray: 0x778899,
      lightslategrey: 0x778899,
      lightsteelblue: 0xb0c4de,
      lightyellow: 0xffffe0,
      lime: 0x00ff00,
      limegreen: 0x32cd32,
      linen: 0xfaf0e6,
      magenta: 0xff00ff,
      maroon: 0x800000,
      mediumaquamarine: 0x66cdaa,
      mediumblue: 0x0000cd,
      mediumorchid: 0xba55d3,
      mediumpurple: 0x9370db,
      mediumseagreen: 0x3cb371,
      mediumslateblue: 0x7b68ee,
      mediumspringgreen: 0x00fa9a,
      mediumturquoise: 0x48d1cc,
      mediumvioletred: 0xc71585,
      midnightblue: 0x191970,
      mintcream: 0xf5fffa,
      mistyrose: 0xffe4e1,
      moccasin: 0xffe4b5,
      navajowhite: 0xffdead,
      navy: 0x000080,
      oldlace: 0xfdf5e6,
      olive: 0x808000,
      olivedrab: 0x6b8e23,
      orange: 0xffa500,
      orangered: 0xff4500,
      orchid: 0xda70d6,
      palegoldenrod: 0xeee8aa,
      palegreen: 0x98fb98,
      paleturquoise: 0xafeeee,
      palevioletred: 0xdb7093,
      papayawhip: 0xffefd5,
      peachpuff: 0xffdab9,
      peru: 0xcd853f,
      pink: 0xffc0cb,
      plum: 0xdda0dd,
      powderblue: 0xb0e0e6,
      purple: 0x800080,
      rebeccapurple: 0x663399,
      red: 0xff0000,
      rosybrown: 0xbc8f8f,
      royalblue: 0x4169e1,
      saddlebrown: 0x8b4513,
      salmon: 0xfa8072,
      sandybrown: 0xf4a460,
      seagreen: 0x2e8b57,
      seashell: 0xfff5ee,
      sienna: 0xa0522d,
      silver: 0xc0c0c0,
      skyblue: 0x87ceeb,
      slateblue: 0x6a5acd,
      slategray: 0x708090,
      slategrey: 0x708090,
      snow: 0xfffafa,
      springgreen: 0x00ff7f,
      steelblue: 0x4682b4,
      tan: 0xd2b48c,
      teal: 0x008080,
      thistle: 0xd8bfd8,
      tomato: 0xff6347,
      turquoise: 0x40e0d0,
      violet: 0xee82ee,
      wheat: 0xf5deb3,
      white: 0xffffff,
      whitesmoke: 0xf5f5f5,
      yellow: 0xffff00,
      yellowgreen: 0x9acd32
    };

    define(Color, color, {
      copy(channels) {
        return Object.assign(new this.constructor, this, channels);
      },
      displayable() {
        return this.rgb().displayable();
      },
      hex: color_formatHex, // Deprecated! Use color.formatHex.
      formatHex: color_formatHex,
      formatHex8: color_formatHex8,
      formatHsl: color_formatHsl,
      formatRgb: color_formatRgb,
      toString: color_formatRgb
    });

    function color_formatHex() {
      return this.rgb().formatHex();
    }

    function color_formatHex8() {
      return this.rgb().formatHex8();
    }

    function color_formatHsl() {
      return hslConvert(this).formatHsl();
    }

    function color_formatRgb() {
      return this.rgb().formatRgb();
    }

    function color(format) {
      var m, l;
      format = (format + "").trim().toLowerCase();
      return (m = reHex.exec(format)) ? (l = m[1].length, m = parseInt(m[1], 16), l === 6 ? rgbn(m) // #ff0000
          : l === 3 ? new Rgb((m >> 8 & 0xf) | (m >> 4 & 0xf0), (m >> 4 & 0xf) | (m & 0xf0), ((m & 0xf) << 4) | (m & 0xf), 1) // #f00
          : l === 8 ? rgba(m >> 24 & 0xff, m >> 16 & 0xff, m >> 8 & 0xff, (m & 0xff) / 0xff) // #ff000000
          : l === 4 ? rgba((m >> 12 & 0xf) | (m >> 8 & 0xf0), (m >> 8 & 0xf) | (m >> 4 & 0xf0), (m >> 4 & 0xf) | (m & 0xf0), (((m & 0xf) << 4) | (m & 0xf)) / 0xff) // #f000
          : null) // invalid hex
          : (m = reRgbInteger.exec(format)) ? new Rgb(m[1], m[2], m[3], 1) // rgb(255, 0, 0)
          : (m = reRgbPercent.exec(format)) ? new Rgb(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, 1) // rgb(100%, 0%, 0%)
          : (m = reRgbaInteger.exec(format)) ? rgba(m[1], m[2], m[3], m[4]) // rgba(255, 0, 0, 1)
          : (m = reRgbaPercent.exec(format)) ? rgba(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, m[4]) // rgb(100%, 0%, 0%, 1)
          : (m = reHslPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, 1) // hsl(120, 50%, 50%)
          : (m = reHslaPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, m[4]) // hsla(120, 50%, 50%, 1)
          : named.hasOwnProperty(format) ? rgbn(named[format]) // eslint-disable-line no-prototype-builtins
          : format === "transparent" ? new Rgb(NaN, NaN, NaN, 0)
          : null;
    }

    function rgbn(n) {
      return new Rgb(n >> 16 & 0xff, n >> 8 & 0xff, n & 0xff, 1);
    }

    function rgba(r, g, b, a) {
      if (a <= 0) r = g = b = NaN;
      return new Rgb(r, g, b, a);
    }

    function rgbConvert(o) {
      if (!(o instanceof Color)) o = color(o);
      if (!o) return new Rgb;
      o = o.rgb();
      return new Rgb(o.r, o.g, o.b, o.opacity);
    }

    function rgb$1(r, g, b, opacity) {
      return arguments.length === 1 ? rgbConvert(r) : new Rgb(r, g, b, opacity == null ? 1 : opacity);
    }

    function Rgb(r, g, b, opacity) {
      this.r = +r;
      this.g = +g;
      this.b = +b;
      this.opacity = +opacity;
    }

    define(Rgb, rgb$1, extend$1(Color, {
      brighter(k) {
        k = k == null ? brighter : Math.pow(brighter, k);
        return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
      },
      darker(k) {
        k = k == null ? darker : Math.pow(darker, k);
        return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
      },
      rgb() {
        return this;
      },
      clamp() {
        return new Rgb(clampi(this.r), clampi(this.g), clampi(this.b), clampa(this.opacity));
      },
      displayable() {
        return (-0.5 <= this.r && this.r < 255.5)
            && (-0.5 <= this.g && this.g < 255.5)
            && (-0.5 <= this.b && this.b < 255.5)
            && (0 <= this.opacity && this.opacity <= 1);
      },
      hex: rgb_formatHex, // Deprecated! Use color.formatHex.
      formatHex: rgb_formatHex,
      formatHex8: rgb_formatHex8,
      formatRgb: rgb_formatRgb,
      toString: rgb_formatRgb
    }));

    function rgb_formatHex() {
      return `#${hex(this.r)}${hex(this.g)}${hex(this.b)}`;
    }

    function rgb_formatHex8() {
      return `#${hex(this.r)}${hex(this.g)}${hex(this.b)}${hex((isNaN(this.opacity) ? 1 : this.opacity) * 255)}`;
    }

    function rgb_formatRgb() {
      const a = clampa(this.opacity);
      return `${a === 1 ? "rgb(" : "rgba("}${clampi(this.r)}, ${clampi(this.g)}, ${clampi(this.b)}${a === 1 ? ")" : `, ${a})`}`;
    }

    function clampa(opacity) {
      return isNaN(opacity) ? 1 : Math.max(0, Math.min(1, opacity));
    }

    function clampi(value) {
      return Math.max(0, Math.min(255, Math.round(value) || 0));
    }

    function hex(value) {
      value = clampi(value);
      return (value < 16 ? "0" : "") + value.toString(16);
    }

    function hsla(h, s, l, a) {
      if (a <= 0) h = s = l = NaN;
      else if (l <= 0 || l >= 1) h = s = NaN;
      else if (s <= 0) h = NaN;
      return new Hsl(h, s, l, a);
    }

    function hslConvert(o) {
      if (o instanceof Hsl) return new Hsl(o.h, o.s, o.l, o.opacity);
      if (!(o instanceof Color)) o = color(o);
      if (!o) return new Hsl;
      if (o instanceof Hsl) return o;
      o = o.rgb();
      var r = o.r / 255,
          g = o.g / 255,
          b = o.b / 255,
          min = Math.min(r, g, b),
          max = Math.max(r, g, b),
          h = NaN,
          s = max - min,
          l = (max + min) / 2;
      if (s) {
        if (r === max) h = (g - b) / s + (g < b) * 6;
        else if (g === max) h = (b - r) / s + 2;
        else h = (r - g) / s + 4;
        s /= l < 0.5 ? max + min : 2 - max - min;
        h *= 60;
      } else {
        s = l > 0 && l < 1 ? 0 : h;
      }
      return new Hsl(h, s, l, o.opacity);
    }

    function hsl(h, s, l, opacity) {
      return arguments.length === 1 ? hslConvert(h) : new Hsl(h, s, l, opacity == null ? 1 : opacity);
    }

    function Hsl(h, s, l, opacity) {
      this.h = +h;
      this.s = +s;
      this.l = +l;
      this.opacity = +opacity;
    }

    define(Hsl, hsl, extend$1(Color, {
      brighter(k) {
        k = k == null ? brighter : Math.pow(brighter, k);
        return new Hsl(this.h, this.s, this.l * k, this.opacity);
      },
      darker(k) {
        k = k == null ? darker : Math.pow(darker, k);
        return new Hsl(this.h, this.s, this.l * k, this.opacity);
      },
      rgb() {
        var h = this.h % 360 + (this.h < 0) * 360,
            s = isNaN(h) || isNaN(this.s) ? 0 : this.s,
            l = this.l,
            m2 = l + (l < 0.5 ? l : 1 - l) * s,
            m1 = 2 * l - m2;
        return new Rgb(
          hsl2rgb(h >= 240 ? h - 240 : h + 120, m1, m2),
          hsl2rgb(h, m1, m2),
          hsl2rgb(h < 120 ? h + 240 : h - 120, m1, m2),
          this.opacity
        );
      },
      clamp() {
        return new Hsl(clamph(this.h), clampt(this.s), clampt(this.l), clampa(this.opacity));
      },
      displayable() {
        return (0 <= this.s && this.s <= 1 || isNaN(this.s))
            && (0 <= this.l && this.l <= 1)
            && (0 <= this.opacity && this.opacity <= 1);
      },
      formatHsl() {
        const a = clampa(this.opacity);
        return `${a === 1 ? "hsl(" : "hsla("}${clamph(this.h)}, ${clampt(this.s) * 100}%, ${clampt(this.l) * 100}%${a === 1 ? ")" : `, ${a})`}`;
      }
    }));

    function clamph(value) {
      value = (value || 0) % 360;
      return value < 0 ? value + 360 : value;
    }

    function clampt(value) {
      return Math.max(0, Math.min(1, value || 0));
    }

    /* From FvD 13.37, CSS Color Module Level 3 */
    function hsl2rgb(h, m1, m2) {
      return (h < 60 ? m1 + (m2 - m1) * h / 60
          : h < 180 ? m2
          : h < 240 ? m1 + (m2 - m1) * (240 - h) / 60
          : m1) * 255;
    }

    var constant = x => () => x;

    function linear$1(a, d) {
      return function(t) {
        return a + t * d;
      };
    }

    function exponential(a, b, y) {
      return a = Math.pow(a, y), b = Math.pow(b, y) - a, y = 1 / y, function(t) {
        return Math.pow(a + t * b, y);
      };
    }

    function gamma(y) {
      return (y = +y) === 1 ? nogamma : function(a, b) {
        return b - a ? exponential(a, b, y) : constant(isNaN(a) ? b : a);
      };
    }

    function nogamma(a, b) {
      var d = b - a;
      return d ? linear$1(a, d) : constant(isNaN(a) ? b : a);
    }

    var rgb = (function rgbGamma(y) {
      var color = gamma(y);

      function rgb(start, end) {
        var r = color((start = rgb$1(start)).r, (end = rgb$1(end)).r),
            g = color(start.g, end.g),
            b = color(start.b, end.b),
            opacity = nogamma(start.opacity, end.opacity);
        return function(t) {
          start.r = r(t);
          start.g = g(t);
          start.b = b(t);
          start.opacity = opacity(t);
          return start + "";
        };
      }

      rgb.gamma = rgbGamma;

      return rgb;
    })(1);

    function numberArray(a, b) {
      if (!b) b = [];
      var n = a ? Math.min(b.length, a.length) : 0,
          c = b.slice(),
          i;
      return function(t) {
        for (i = 0; i < n; ++i) c[i] = a[i] * (1 - t) + b[i] * t;
        return c;
      };
    }

    function isNumberArray(x) {
      return ArrayBuffer.isView(x) && !(x instanceof DataView);
    }

    function genericArray(a, b) {
      var nb = b ? b.length : 0,
          na = a ? Math.min(nb, a.length) : 0,
          x = new Array(na),
          c = new Array(nb),
          i;

      for (i = 0; i < na; ++i) x[i] = interpolate(a[i], b[i]);
      for (; i < nb; ++i) c[i] = b[i];

      return function(t) {
        for (i = 0; i < na; ++i) c[i] = x[i](t);
        return c;
      };
    }

    function date(a, b) {
      var d = new Date;
      return a = +a, b = +b, function(t) {
        return d.setTime(a * (1 - t) + b * t), d;
      };
    }

    function interpolateNumber(a, b) {
      return a = +a, b = +b, function(t) {
        return a * (1 - t) + b * t;
      };
    }

    function object(a, b) {
      var i = {},
          c = {},
          k;

      if (a === null || typeof a !== "object") a = {};
      if (b === null || typeof b !== "object") b = {};

      for (k in b) {
        if (k in a) {
          i[k] = interpolate(a[k], b[k]);
        } else {
          c[k] = b[k];
        }
      }

      return function(t) {
        for (k in i) c[k] = i[k](t);
        return c;
      };
    }

    var reA = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g,
        reB = new RegExp(reA.source, "g");

    function zero(b) {
      return function() {
        return b;
      };
    }

    function one(b) {
      return function(t) {
        return b(t) + "";
      };
    }

    function string(a, b) {
      var bi = reA.lastIndex = reB.lastIndex = 0, // scan index for next number in b
          am, // current match in a
          bm, // current match in b
          bs, // string preceding current number in b, if any
          i = -1, // index in s
          s = [], // string constants and placeholders
          q = []; // number interpolators

      // Coerce inputs to strings.
      a = a + "", b = b + "";

      // Interpolate pairs of numbers in a & b.
      while ((am = reA.exec(a))
          && (bm = reB.exec(b))) {
        if ((bs = bm.index) > bi) { // a string precedes the next number in b
          bs = b.slice(bi, bs);
          if (s[i]) s[i] += bs; // coalesce with previous string
          else s[++i] = bs;
        }
        if ((am = am[0]) === (bm = bm[0])) { // numbers in a & b match
          if (s[i]) s[i] += bm; // coalesce with previous string
          else s[++i] = bm;
        } else { // interpolate non-matching numbers
          s[++i] = null;
          q.push({i: i, x: interpolateNumber(am, bm)});
        }
        bi = reB.lastIndex;
      }

      // Add remains of b.
      if (bi < b.length) {
        bs = b.slice(bi);
        if (s[i]) s[i] += bs; // coalesce with previous string
        else s[++i] = bs;
      }

      // Special optimization for only a single match.
      // Otherwise, interpolate each of the numbers and rejoin the string.
      return s.length < 2 ? (q[0]
          ? one(q[0].x)
          : zero(b))
          : (b = q.length, function(t) {
              for (var i = 0, o; i < b; ++i) s[(o = q[i]).i] = o.x(t);
              return s.join("");
            });
    }

    function interpolate(a, b) {
      var t = typeof b, c;
      return b == null || t === "boolean" ? constant(b)
          : (t === "number" ? interpolateNumber
          : t === "string" ? ((c = color(b)) ? (b = c, rgb) : string)
          : b instanceof color ? rgb
          : b instanceof Date ? date
          : isNumberArray(b) ? numberArray
          : Array.isArray(b) ? genericArray
          : typeof b.valueOf !== "function" && typeof b.toString !== "function" || isNaN(b) ? object
          : interpolateNumber)(a, b);
    }

    function interpolateRound(a, b) {
      return a = +a, b = +b, function(t) {
        return Math.round(a * (1 - t) + b * t);
      };
    }

    function constants(x) {
      return function() {
        return x;
      };
    }

    function number(x) {
      return +x;
    }

    var unit = [0, 1];

    function identity$2(x) {
      return x;
    }

    function normalize(a, b) {
      return (b -= (a = +a))
          ? function(x) { return (x - a) / b; }
          : constants(isNaN(b) ? NaN : 0.5);
    }

    function clamper(a, b) {
      var t;
      if (a > b) t = a, a = b, b = t;
      return function(x) { return Math.max(a, Math.min(b, x)); };
    }

    // normalize(a, b)(x) takes a domain value x in [a,b] and returns the corresponding parameter t in [0,1].
    // interpolate(a, b)(t) takes a parameter t in [0,1] and returns the corresponding range value x in [a,b].
    function bimap(domain, range, interpolate) {
      var d0 = domain[0], d1 = domain[1], r0 = range[0], r1 = range[1];
      if (d1 < d0) d0 = normalize(d1, d0), r0 = interpolate(r1, r0);
      else d0 = normalize(d0, d1), r0 = interpolate(r0, r1);
      return function(x) { return r0(d0(x)); };
    }

    function polymap(domain, range, interpolate) {
      var j = Math.min(domain.length, range.length) - 1,
          d = new Array(j),
          r = new Array(j),
          i = -1;

      // Reverse descending domains.
      if (domain[j] < domain[0]) {
        domain = domain.slice().reverse();
        range = range.slice().reverse();
      }

      while (++i < j) {
        d[i] = normalize(domain[i], domain[i + 1]);
        r[i] = interpolate(range[i], range[i + 1]);
      }

      return function(x) {
        var i = bisect(domain, x, 1, j) - 1;
        return r[i](d[i](x));
      };
    }

    function copy(source, target) {
      return target
          .domain(source.domain())
          .range(source.range())
          .interpolate(source.interpolate())
          .clamp(source.clamp())
          .unknown(source.unknown());
    }

    function transformer() {
      var domain = unit,
          range = unit,
          interpolate$1 = interpolate,
          transform,
          untransform,
          unknown,
          clamp = identity$2,
          piecewise,
          output,
          input;

      function rescale() {
        var n = Math.min(domain.length, range.length);
        if (clamp !== identity$2) clamp = clamper(domain[0], domain[n - 1]);
        piecewise = n > 2 ? polymap : bimap;
        output = input = null;
        return scale;
      }

      function scale(x) {
        return x == null || isNaN(x = +x) ? unknown : (output || (output = piecewise(domain.map(transform), range, interpolate$1)))(transform(clamp(x)));
      }

      scale.invert = function(y) {
        return clamp(untransform((input || (input = piecewise(range, domain.map(transform), interpolateNumber)))(y)));
      };

      scale.domain = function(_) {
        return arguments.length ? (domain = Array.from(_, number), rescale()) : domain.slice();
      };

      scale.range = function(_) {
        return arguments.length ? (range = Array.from(_), rescale()) : range.slice();
      };

      scale.rangeRound = function(_) {
        return range = Array.from(_), interpolate$1 = interpolateRound, rescale();
      };

      scale.clamp = function(_) {
        return arguments.length ? (clamp = _ ? true : identity$2, rescale()) : clamp !== identity$2;
      };

      scale.interpolate = function(_) {
        return arguments.length ? (interpolate$1 = _, rescale()) : interpolate$1;
      };

      scale.unknown = function(_) {
        return arguments.length ? (unknown = _, scale) : unknown;
      };

      return function(t, u) {
        transform = t, untransform = u;
        return rescale();
      };
    }

    function continuous() {
      return transformer()(identity$2, identity$2);
    }

    function formatDecimal(x) {
      return Math.abs(x = Math.round(x)) >= 1e21
          ? x.toLocaleString("en").replace(/,/g, "")
          : x.toString(10);
    }

    // Computes the decimal coefficient and exponent of the specified number x with
    // significant digits p, where x is positive and p is in [1, 21] or undefined.
    // For example, formatDecimalParts(1.23) returns ["123", 0].
    function formatDecimalParts(x, p) {
      if ((i = (x = p ? x.toExponential(p - 1) : x.toExponential()).indexOf("e")) < 0) return null; // NaN, ±Infinity
      var i, coefficient = x.slice(0, i);

      // The string returned by toExponential either has the form \d\.\d+e[-+]\d+
      // (e.g., 1.2e+3) or the form \de[-+]\d+ (e.g., 1e+3).
      return [
        coefficient.length > 1 ? coefficient[0] + coefficient.slice(2) : coefficient,
        +x.slice(i + 1)
      ];
    }

    function exponent(x) {
      return x = formatDecimalParts(Math.abs(x)), x ? x[1] : NaN;
    }

    function formatGroup(grouping, thousands) {
      return function(value, width) {
        var i = value.length,
            t = [],
            j = 0,
            g = grouping[0],
            length = 0;

        while (i > 0 && g > 0) {
          if (length + g + 1 > width) g = Math.max(1, width - length);
          t.push(value.substring(i -= g, i + g));
          if ((length += g + 1) > width) break;
          g = grouping[j = (j + 1) % grouping.length];
        }

        return t.reverse().join(thousands);
      };
    }

    function formatNumerals(numerals) {
      return function(value) {
        return value.replace(/[0-9]/g, function(i) {
          return numerals[+i];
        });
      };
    }

    // [[fill]align][sign][symbol][0][width][,][.precision][~][type]
    var re = /^(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?$/i;

    function formatSpecifier(specifier) {
      if (!(match = re.exec(specifier))) throw new Error("invalid format: " + specifier);
      var match;
      return new FormatSpecifier({
        fill: match[1],
        align: match[2],
        sign: match[3],
        symbol: match[4],
        zero: match[5],
        width: match[6],
        comma: match[7],
        precision: match[8] && match[8].slice(1),
        trim: match[9],
        type: match[10]
      });
    }

    formatSpecifier.prototype = FormatSpecifier.prototype; // instanceof

    function FormatSpecifier(specifier) {
      this.fill = specifier.fill === undefined ? " " : specifier.fill + "";
      this.align = specifier.align === undefined ? ">" : specifier.align + "";
      this.sign = specifier.sign === undefined ? "-" : specifier.sign + "";
      this.symbol = specifier.symbol === undefined ? "" : specifier.symbol + "";
      this.zero = !!specifier.zero;
      this.width = specifier.width === undefined ? undefined : +specifier.width;
      this.comma = !!specifier.comma;
      this.precision = specifier.precision === undefined ? undefined : +specifier.precision;
      this.trim = !!specifier.trim;
      this.type = specifier.type === undefined ? "" : specifier.type + "";
    }

    FormatSpecifier.prototype.toString = function() {
      return this.fill
          + this.align
          + this.sign
          + this.symbol
          + (this.zero ? "0" : "")
          + (this.width === undefined ? "" : Math.max(1, this.width | 0))
          + (this.comma ? "," : "")
          + (this.precision === undefined ? "" : "." + Math.max(0, this.precision | 0))
          + (this.trim ? "~" : "")
          + this.type;
    };

    // Trims insignificant zeros, e.g., replaces 1.2000k with 1.2k.
    function formatTrim(s) {
      out: for (var n = s.length, i = 1, i0 = -1, i1; i < n; ++i) {
        switch (s[i]) {
          case ".": i0 = i1 = i; break;
          case "0": if (i0 === 0) i0 = i; i1 = i; break;
          default: if (!+s[i]) break out; if (i0 > 0) i0 = 0; break;
        }
      }
      return i0 > 0 ? s.slice(0, i0) + s.slice(i1 + 1) : s;
    }

    var prefixExponent;

    function formatPrefixAuto(x, p) {
      var d = formatDecimalParts(x, p);
      if (!d) return x + "";
      var coefficient = d[0],
          exponent = d[1],
          i = exponent - (prefixExponent = Math.max(-8, Math.min(8, Math.floor(exponent / 3))) * 3) + 1,
          n = coefficient.length;
      return i === n ? coefficient
          : i > n ? coefficient + new Array(i - n + 1).join("0")
          : i > 0 ? coefficient.slice(0, i) + "." + coefficient.slice(i)
          : "0." + new Array(1 - i).join("0") + formatDecimalParts(x, Math.max(0, p + i - 1))[0]; // less than 1y!
    }

    function formatRounded(x, p) {
      var d = formatDecimalParts(x, p);
      if (!d) return x + "";
      var coefficient = d[0],
          exponent = d[1];
      return exponent < 0 ? "0." + new Array(-exponent).join("0") + coefficient
          : coefficient.length > exponent + 1 ? coefficient.slice(0, exponent + 1) + "." + coefficient.slice(exponent + 1)
          : coefficient + new Array(exponent - coefficient.length + 2).join("0");
    }

    var formatTypes = {
      "%": (x, p) => (x * 100).toFixed(p),
      "b": (x) => Math.round(x).toString(2),
      "c": (x) => x + "",
      "d": formatDecimal,
      "e": (x, p) => x.toExponential(p),
      "f": (x, p) => x.toFixed(p),
      "g": (x, p) => x.toPrecision(p),
      "o": (x) => Math.round(x).toString(8),
      "p": (x, p) => formatRounded(x * 100, p),
      "r": formatRounded,
      "s": formatPrefixAuto,
      "X": (x) => Math.round(x).toString(16).toUpperCase(),
      "x": (x) => Math.round(x).toString(16)
    };

    function identity$1(x) {
      return x;
    }

    var map = Array.prototype.map,
        prefixes = ["y","z","a","f","p","n","µ","m","","k","M","G","T","P","E","Z","Y"];

    function formatLocale(locale) {
      var group = locale.grouping === undefined || locale.thousands === undefined ? identity$1 : formatGroup(map.call(locale.grouping, Number), locale.thousands + ""),
          currencyPrefix = locale.currency === undefined ? "" : locale.currency[0] + "",
          currencySuffix = locale.currency === undefined ? "" : locale.currency[1] + "",
          decimal = locale.decimal === undefined ? "." : locale.decimal + "",
          numerals = locale.numerals === undefined ? identity$1 : formatNumerals(map.call(locale.numerals, String)),
          percent = locale.percent === undefined ? "%" : locale.percent + "",
          minus = locale.minus === undefined ? "−" : locale.minus + "",
          nan = locale.nan === undefined ? "NaN" : locale.nan + "";

      function newFormat(specifier) {
        specifier = formatSpecifier(specifier);

        var fill = specifier.fill,
            align = specifier.align,
            sign = specifier.sign,
            symbol = specifier.symbol,
            zero = specifier.zero,
            width = specifier.width,
            comma = specifier.comma,
            precision = specifier.precision,
            trim = specifier.trim,
            type = specifier.type;

        // The "n" type is an alias for ",g".
        if (type === "n") comma = true, type = "g";

        // The "" type, and any invalid type, is an alias for ".12~g".
        else if (!formatTypes[type]) precision === undefined && (precision = 12), trim = true, type = "g";

        // If zero fill is specified, padding goes after sign and before digits.
        if (zero || (fill === "0" && align === "=")) zero = true, fill = "0", align = "=";

        // Compute the prefix and suffix.
        // For SI-prefix, the suffix is lazily computed.
        var prefix = symbol === "$" ? currencyPrefix : symbol === "#" && /[boxX]/.test(type) ? "0" + type.toLowerCase() : "",
            suffix = symbol === "$" ? currencySuffix : /[%p]/.test(type) ? percent : "";

        // What format function should we use?
        // Is this an integer type?
        // Can this type generate exponential notation?
        var formatType = formatTypes[type],
            maybeSuffix = /[defgprs%]/.test(type);

        // Set the default precision if not specified,
        // or clamp the specified precision to the supported range.
        // For significant precision, it must be in [1, 21].
        // For fixed precision, it must be in [0, 20].
        precision = precision === undefined ? 6
            : /[gprs]/.test(type) ? Math.max(1, Math.min(21, precision))
            : Math.max(0, Math.min(20, precision));

        function format(value) {
          var valuePrefix = prefix,
              valueSuffix = suffix,
              i, n, c;

          if (type === "c") {
            valueSuffix = formatType(value) + valueSuffix;
            value = "";
          } else {
            value = +value;

            // Determine the sign. -0 is not less than 0, but 1 / -0 is!
            var valueNegative = value < 0 || 1 / value < 0;

            // Perform the initial formatting.
            value = isNaN(value) ? nan : formatType(Math.abs(value), precision);

            // Trim insignificant zeros.
            if (trim) value = formatTrim(value);

            // If a negative value rounds to zero after formatting, and no explicit positive sign is requested, hide the sign.
            if (valueNegative && +value === 0 && sign !== "+") valueNegative = false;

            // Compute the prefix and suffix.
            valuePrefix = (valueNegative ? (sign === "(" ? sign : minus) : sign === "-" || sign === "(" ? "" : sign) + valuePrefix;
            valueSuffix = (type === "s" ? prefixes[8 + prefixExponent / 3] : "") + valueSuffix + (valueNegative && sign === "(" ? ")" : "");

            // Break the formatted value into the integer “value” part that can be
            // grouped, and fractional or exponential “suffix” part that is not.
            if (maybeSuffix) {
              i = -1, n = value.length;
              while (++i < n) {
                if (c = value.charCodeAt(i), 48 > c || c > 57) {
                  valueSuffix = (c === 46 ? decimal + value.slice(i + 1) : value.slice(i)) + valueSuffix;
                  value = value.slice(0, i);
                  break;
                }
              }
            }
          }

          // If the fill character is not "0", grouping is applied before padding.
          if (comma && !zero) value = group(value, Infinity);

          // Compute the padding.
          var length = valuePrefix.length + value.length + valueSuffix.length,
              padding = length < width ? new Array(width - length + 1).join(fill) : "";

          // If the fill character is "0", grouping is applied after padding.
          if (comma && zero) value = group(padding + value, padding.length ? width - valueSuffix.length : Infinity), padding = "";

          // Reconstruct the final output based on the desired alignment.
          switch (align) {
            case "<": value = valuePrefix + value + valueSuffix + padding; break;
            case "=": value = valuePrefix + padding + value + valueSuffix; break;
            case "^": value = padding.slice(0, length = padding.length >> 1) + valuePrefix + value + valueSuffix + padding.slice(length); break;
            default: value = padding + valuePrefix + value + valueSuffix; break;
          }

          return numerals(value);
        }

        format.toString = function() {
          return specifier + "";
        };

        return format;
      }

      function formatPrefix(specifier, value) {
        var f = newFormat((specifier = formatSpecifier(specifier), specifier.type = "f", specifier)),
            e = Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3,
            k = Math.pow(10, -e),
            prefix = prefixes[8 + e / 3];
        return function(value) {
          return f(k * value) + prefix;
        };
      }

      return {
        format: newFormat,
        formatPrefix: formatPrefix
      };
    }

    var locale;
    var format;
    var formatPrefix;

    defaultLocale({
      thousands: ",",
      grouping: [3],
      currency: ["$", ""]
    });

    function defaultLocale(definition) {
      locale = formatLocale(definition);
      format = locale.format;
      formatPrefix = locale.formatPrefix;
      return locale;
    }

    function precisionFixed(step) {
      return Math.max(0, -exponent(Math.abs(step)));
    }

    function precisionPrefix(step, value) {
      return Math.max(0, Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3 - exponent(Math.abs(step)));
    }

    function precisionRound(step, max) {
      step = Math.abs(step), max = Math.abs(max) - step;
      return Math.max(0, exponent(max) - exponent(step)) + 1;
    }

    function tickFormat(start, stop, count, specifier) {
      var step = tickStep(start, stop, count),
          precision;
      specifier = formatSpecifier(specifier == null ? ",f" : specifier);
      switch (specifier.type) {
        case "s": {
          var value = Math.max(Math.abs(start), Math.abs(stop));
          if (specifier.precision == null && !isNaN(precision = precisionPrefix(step, value))) specifier.precision = precision;
          return formatPrefix(specifier, value);
        }
        case "":
        case "e":
        case "g":
        case "p":
        case "r": {
          if (specifier.precision == null && !isNaN(precision = precisionRound(step, Math.max(Math.abs(start), Math.abs(stop))))) specifier.precision = precision - (specifier.type === "e");
          break;
        }
        case "f":
        case "%": {
          if (specifier.precision == null && !isNaN(precision = precisionFixed(step))) specifier.precision = precision - (specifier.type === "%") * 2;
          break;
        }
      }
      return format(specifier);
    }

    function linearish(scale) {
      var domain = scale.domain;

      scale.ticks = function(count) {
        var d = domain();
        return ticks(d[0], d[d.length - 1], count == null ? 10 : count);
      };

      scale.tickFormat = function(count, specifier) {
        var d = domain();
        return tickFormat(d[0], d[d.length - 1], count == null ? 10 : count, specifier);
      };

      scale.nice = function(count) {
        if (count == null) count = 10;

        var d = domain();
        var i0 = 0;
        var i1 = d.length - 1;
        var start = d[i0];
        var stop = d[i1];
        var prestep;
        var step;
        var maxIter = 10;

        if (stop < start) {
          step = start, start = stop, stop = step;
          step = i0, i0 = i1, i1 = step;
        }
        
        while (maxIter-- > 0) {
          step = tickIncrement(start, stop, count);
          if (step === prestep) {
            d[i0] = start;
            d[i1] = stop;
            return domain(d);
          } else if (step > 0) {
            start = Math.floor(start / step) * step;
            stop = Math.ceil(stop / step) * step;
          } else if (step < 0) {
            start = Math.ceil(start * step) / step;
            stop = Math.floor(stop * step) / step;
          } else {
            break;
          }
          prestep = step;
        }

        return scale;
      };

      return scale;
    }

    function linear() {
      var scale = continuous();

      scale.copy = function() {
        return copy(scale, linear());
      };

      initRange$1.apply(scale, arguments);

      return linearish(scale);
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop$1) {
        let stop;
        const subscribers = new Set();
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (const subscriber of subscribers) {
                        subscriber[1]();
                        subscriber_queue.push(subscriber, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop$1) {
            const subscriber = [run, invalidate];
            subscribers.add(subscriber);
            if (subscribers.size === 1) {
                stop = start(set) || noop$1;
            }
            run(value);
            return () => {
                subscribers.delete(subscriber);
                if (subscribers.size === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    const pi$1 = Math.PI,
        tau$1 = 2 * pi$1,
        epsilon$1 = 1e-6,
        tauEpsilon$1 = tau$1 - epsilon$1;

    function Path() {
      this._x0 = this._y0 = // start of current subpath
      this._x1 = this._y1 = null; // end of current subpath
      this._ = "";
    }

    function path() {
      return new Path;
    }

    Path.prototype = path.prototype = {
      constructor: Path,
      moveTo: function(x, y) {
        this._ += "M" + (this._x0 = this._x1 = +x) + "," + (this._y0 = this._y1 = +y);
      },
      closePath: function() {
        if (this._x1 !== null) {
          this._x1 = this._x0, this._y1 = this._y0;
          this._ += "Z";
        }
      },
      lineTo: function(x, y) {
        this._ += "L" + (this._x1 = +x) + "," + (this._y1 = +y);
      },
      quadraticCurveTo: function(x1, y1, x, y) {
        this._ += "Q" + (+x1) + "," + (+y1) + "," + (this._x1 = +x) + "," + (this._y1 = +y);
      },
      bezierCurveTo: function(x1, y1, x2, y2, x, y) {
        this._ += "C" + (+x1) + "," + (+y1) + "," + (+x2) + "," + (+y2) + "," + (this._x1 = +x) + "," + (this._y1 = +y);
      },
      arcTo: function(x1, y1, x2, y2, r) {
        x1 = +x1, y1 = +y1, x2 = +x2, y2 = +y2, r = +r;
        var x0 = this._x1,
            y0 = this._y1,
            x21 = x2 - x1,
            y21 = y2 - y1,
            x01 = x0 - x1,
            y01 = y0 - y1,
            l01_2 = x01 * x01 + y01 * y01;

        // Is the radius negative? Error.
        if (r < 0) throw new Error("negative radius: " + r);

        // Is this path empty? Move to (x1,y1).
        if (this._x1 === null) {
          this._ += "M" + (this._x1 = x1) + "," + (this._y1 = y1);
        }

        // Or, is (x1,y1) coincident with (x0,y0)? Do nothing.
        else if (!(l01_2 > epsilon$1));

        // Or, are (x0,y0), (x1,y1) and (x2,y2) collinear?
        // Equivalently, is (x1,y1) coincident with (x2,y2)?
        // Or, is the radius zero? Line to (x1,y1).
        else if (!(Math.abs(y01 * x21 - y21 * x01) > epsilon$1) || !r) {
          this._ += "L" + (this._x1 = x1) + "," + (this._y1 = y1);
        }

        // Otherwise, draw an arc!
        else {
          var x20 = x2 - x0,
              y20 = y2 - y0,
              l21_2 = x21 * x21 + y21 * y21,
              l20_2 = x20 * x20 + y20 * y20,
              l21 = Math.sqrt(l21_2),
              l01 = Math.sqrt(l01_2),
              l = r * Math.tan((pi$1 - Math.acos((l21_2 + l01_2 - l20_2) / (2 * l21 * l01))) / 2),
              t01 = l / l01,
              t21 = l / l21;

          // If the start tangent is not coincident with (x0,y0), line to.
          if (Math.abs(t01 - 1) > epsilon$1) {
            this._ += "L" + (x1 + t01 * x01) + "," + (y1 + t01 * y01);
          }

          this._ += "A" + r + "," + r + ",0,0," + (+(y01 * x20 > x01 * y20)) + "," + (this._x1 = x1 + t21 * x21) + "," + (this._y1 = y1 + t21 * y21);
        }
      },
      arc: function(x, y, r, a0, a1, ccw) {
        x = +x, y = +y, r = +r, ccw = !!ccw;
        var dx = r * Math.cos(a0),
            dy = r * Math.sin(a0),
            x0 = x + dx,
            y0 = y + dy,
            cw = 1 ^ ccw,
            da = ccw ? a0 - a1 : a1 - a0;

        // Is the radius negative? Error.
        if (r < 0) throw new Error("negative radius: " + r);

        // Is this path empty? Move to (x0,y0).
        if (this._x1 === null) {
          this._ += "M" + x0 + "," + y0;
        }

        // Or, is (x0,y0) not coincident with the previous point? Line to (x0,y0).
        else if (Math.abs(this._x1 - x0) > epsilon$1 || Math.abs(this._y1 - y0) > epsilon$1) {
          this._ += "L" + x0 + "," + y0;
        }

        // Is this arc empty? We’re done.
        if (!r) return;

        // Does the angle go the wrong way? Flip the direction.
        if (da < 0) da = da % tau$1 + tau$1;

        // Is this a complete circle? Draw two arcs to complete the circle.
        if (da > tauEpsilon$1) {
          this._ += "A" + r + "," + r + ",0,1," + cw + "," + (x - dx) + "," + (y - dy) + "A" + r + "," + r + ",0,1," + cw + "," + (this._x1 = x0) + "," + (this._y1 = y0);
        }

        // Is this arc non-empty? Draw an arc!
        else if (da > epsilon$1) {
          this._ += "A" + r + "," + r + ",0," + (+(da >= pi$1)) + "," + cw + "," + (this._x1 = x + r * Math.cos(a1)) + "," + (this._y1 = y + r * Math.sin(a1));
        }
      },
      rect: function(x, y, w, h) {
        this._ += "M" + (this._x0 = this._x1 = +x) + "," + (this._y0 = this._y1 = +y) + "h" + (+w) + "v" + (+h) + "h" + (-w) + "Z";
      },
      toString: function() {
        return this._;
      }
    };

    function quickselect(arr, k, left, right, compare) {
        quickselectStep(arr, k, left || 0, right || (arr.length - 1), compare || defaultCompare);
    }

    function quickselectStep(arr, k, left, right, compare) {

        while (right > left) {
            if (right - left > 600) {
                var n = right - left + 1;
                var m = k - left + 1;
                var z = Math.log(n);
                var s = 0.5 * Math.exp(2 * z / 3);
                var sd = 0.5 * Math.sqrt(z * s * (n - s) / n) * (m - n / 2 < 0 ? -1 : 1);
                var newLeft = Math.max(left, Math.floor(k - m * s / n + sd));
                var newRight = Math.min(right, Math.floor(k + (n - m) * s / n + sd));
                quickselectStep(arr, k, newLeft, newRight, compare);
            }

            var t = arr[k];
            var i = left;
            var j = right;

            swap(arr, left, k);
            if (compare(arr[right], t) > 0) swap(arr, left, right);

            while (i < j) {
                swap(arr, i, j);
                i++;
                j--;
                while (compare(arr[i], t) < 0) i++;
                while (compare(arr[j], t) > 0) j--;
            }

            if (compare(arr[left], t) === 0) swap(arr, left, j);
            else {
                j++;
                swap(arr, j, right);
            }

            if (j <= k) left = j + 1;
            if (k <= j) right = j - 1;
        }
    }

    function swap(arr, i, j) {
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }

    function defaultCompare(a, b) {
        return a < b ? -1 : a > b ? 1 : 0;
    }

    class RBush {
        constructor(maxEntries = 9) {
            // max entries in a node is 9 by default; min node fill is 40% for best performance
            this._maxEntries = Math.max(4, maxEntries);
            this._minEntries = Math.max(2, Math.ceil(this._maxEntries * 0.4));
            this.clear();
        }

        all() {
            return this._all(this.data, []);
        }

        search(bbox) {
            let node = this.data;
            const result = [];

            if (!intersects(bbox, node)) return result;

            const toBBox = this.toBBox;
            const nodesToSearch = [];

            while (node) {
                for (let i = 0; i < node.children.length; i++) {
                    const child = node.children[i];
                    const childBBox = node.leaf ? toBBox(child) : child;

                    if (intersects(bbox, childBBox)) {
                        if (node.leaf) result.push(child);
                        else if (contains(bbox, childBBox)) this._all(child, result);
                        else nodesToSearch.push(child);
                    }
                }
                node = nodesToSearch.pop();
            }

            return result;
        }

        collides(bbox) {
            let node = this.data;

            if (!intersects(bbox, node)) return false;

            const nodesToSearch = [];
            while (node) {
                for (let i = 0; i < node.children.length; i++) {
                    const child = node.children[i];
                    const childBBox = node.leaf ? this.toBBox(child) : child;

                    if (intersects(bbox, childBBox)) {
                        if (node.leaf || contains(bbox, childBBox)) return true;
                        nodesToSearch.push(child);
                    }
                }
                node = nodesToSearch.pop();
            }

            return false;
        }

        load(data) {
            if (!(data && data.length)) return this;

            if (data.length < this._minEntries) {
                for (let i = 0; i < data.length; i++) {
                    this.insert(data[i]);
                }
                return this;
            }

            // recursively build the tree with the given data from scratch using OMT algorithm
            let node = this._build(data.slice(), 0, data.length - 1, 0);

            if (!this.data.children.length) {
                // save as is if tree is empty
                this.data = node;

            } else if (this.data.height === node.height) {
                // split root if trees have the same height
                this._splitRoot(this.data, node);

            } else {
                if (this.data.height < node.height) {
                    // swap trees if inserted one is bigger
                    const tmpNode = this.data;
                    this.data = node;
                    node = tmpNode;
                }

                // insert the small tree into the large tree at appropriate level
                this._insert(node, this.data.height - node.height - 1, true);
            }

            return this;
        }

        insert(item) {
            if (item) this._insert(item, this.data.height - 1);
            return this;
        }

        clear() {
            this.data = createNode([]);
            return this;
        }

        remove(item, equalsFn) {
            if (!item) return this;

            let node = this.data;
            const bbox = this.toBBox(item);
            const path = [];
            const indexes = [];
            let i, parent, goingUp;

            // depth-first iterative tree traversal
            while (node || path.length) {

                if (!node) { // go up
                    node = path.pop();
                    parent = path[path.length - 1];
                    i = indexes.pop();
                    goingUp = true;
                }

                if (node.leaf) { // check current node
                    const index = findItem(item, node.children, equalsFn);

                    if (index !== -1) {
                        // item found, remove the item and condense tree upwards
                        node.children.splice(index, 1);
                        path.push(node);
                        this._condense(path);
                        return this;
                    }
                }

                if (!goingUp && !node.leaf && contains(node, bbox)) { // go down
                    path.push(node);
                    indexes.push(i);
                    i = 0;
                    parent = node;
                    node = node.children[0];

                } else if (parent) { // go right
                    i++;
                    node = parent.children[i];
                    goingUp = false;

                } else node = null; // nothing found
            }

            return this;
        }

        toBBox(item) { return item; }

        compareMinX(a, b) { return a.minX - b.minX; }
        compareMinY(a, b) { return a.minY - b.minY; }

        toJSON() { return this.data; }

        fromJSON(data) {
            this.data = data;
            return this;
        }

        _all(node, result) {
            const nodesToSearch = [];
            while (node) {
                if (node.leaf) result.push(...node.children);
                else nodesToSearch.push(...node.children);

                node = nodesToSearch.pop();
            }
            return result;
        }

        _build(items, left, right, height) {

            const N = right - left + 1;
            let M = this._maxEntries;
            let node;

            if (N <= M) {
                // reached leaf level; return leaf
                node = createNode(items.slice(left, right + 1));
                calcBBox(node, this.toBBox);
                return node;
            }

            if (!height) {
                // target height of the bulk-loaded tree
                height = Math.ceil(Math.log(N) / Math.log(M));

                // target number of root entries to maximize storage utilization
                M = Math.ceil(N / Math.pow(M, height - 1));
            }

            node = createNode([]);
            node.leaf = false;
            node.height = height;

            // split the items into M mostly square tiles

            const N2 = Math.ceil(N / M);
            const N1 = N2 * Math.ceil(Math.sqrt(M));

            multiSelect(items, left, right, N1, this.compareMinX);

            for (let i = left; i <= right; i += N1) {

                const right2 = Math.min(i + N1 - 1, right);

                multiSelect(items, i, right2, N2, this.compareMinY);

                for (let j = i; j <= right2; j += N2) {

                    const right3 = Math.min(j + N2 - 1, right2);

                    // pack each entry recursively
                    node.children.push(this._build(items, j, right3, height - 1));
                }
            }

            calcBBox(node, this.toBBox);

            return node;
        }

        _chooseSubtree(bbox, node, level, path) {
            while (true) {
                path.push(node);

                if (node.leaf || path.length - 1 === level) break;

                let minArea = Infinity;
                let minEnlargement = Infinity;
                let targetNode;

                for (let i = 0; i < node.children.length; i++) {
                    const child = node.children[i];
                    const area = bboxArea(child);
                    const enlargement = enlargedArea(bbox, child) - area;

                    // choose entry with the least area enlargement
                    if (enlargement < minEnlargement) {
                        minEnlargement = enlargement;
                        minArea = area < minArea ? area : minArea;
                        targetNode = child;

                    } else if (enlargement === minEnlargement) {
                        // otherwise choose one with the smallest area
                        if (area < minArea) {
                            minArea = area;
                            targetNode = child;
                        }
                    }
                }

                node = targetNode || node.children[0];
            }

            return node;
        }

        _insert(item, level, isNode) {
            const bbox = isNode ? item : this.toBBox(item);
            const insertPath = [];

            // find the best node for accommodating the item, saving all nodes along the path too
            const node = this._chooseSubtree(bbox, this.data, level, insertPath);

            // put the item into the node
            node.children.push(item);
            extend(node, bbox);

            // split on node overflow; propagate upwards if necessary
            while (level >= 0) {
                if (insertPath[level].children.length > this._maxEntries) {
                    this._split(insertPath, level);
                    level--;
                } else break;
            }

            // adjust bboxes along the insertion path
            this._adjustParentBBoxes(bbox, insertPath, level);
        }

        // split overflowed node into two
        _split(insertPath, level) {
            const node = insertPath[level];
            const M = node.children.length;
            const m = this._minEntries;

            this._chooseSplitAxis(node, m, M);

            const splitIndex = this._chooseSplitIndex(node, m, M);

            const newNode = createNode(node.children.splice(splitIndex, node.children.length - splitIndex));
            newNode.height = node.height;
            newNode.leaf = node.leaf;

            calcBBox(node, this.toBBox);
            calcBBox(newNode, this.toBBox);

            if (level) insertPath[level - 1].children.push(newNode);
            else this._splitRoot(node, newNode);
        }

        _splitRoot(node, newNode) {
            // split root node
            this.data = createNode([node, newNode]);
            this.data.height = node.height + 1;
            this.data.leaf = false;
            calcBBox(this.data, this.toBBox);
        }

        _chooseSplitIndex(node, m, M) {
            let index;
            let minOverlap = Infinity;
            let minArea = Infinity;

            for (let i = m; i <= M - m; i++) {
                const bbox1 = distBBox(node, 0, i, this.toBBox);
                const bbox2 = distBBox(node, i, M, this.toBBox);

                const overlap = intersectionArea(bbox1, bbox2);
                const area = bboxArea(bbox1) + bboxArea(bbox2);

                // choose distribution with minimum overlap
                if (overlap < minOverlap) {
                    minOverlap = overlap;
                    index = i;

                    minArea = area < minArea ? area : minArea;

                } else if (overlap === minOverlap) {
                    // otherwise choose distribution with minimum area
                    if (area < minArea) {
                        minArea = area;
                        index = i;
                    }
                }
            }

            return index || M - m;
        }

        // sorts node children by the best axis for split
        _chooseSplitAxis(node, m, M) {
            const compareMinX = node.leaf ? this.compareMinX : compareNodeMinX;
            const compareMinY = node.leaf ? this.compareMinY : compareNodeMinY;
            const xMargin = this._allDistMargin(node, m, M, compareMinX);
            const yMargin = this._allDistMargin(node, m, M, compareMinY);

            // if total distributions margin value is minimal for x, sort by minX,
            // otherwise it's already sorted by minY
            if (xMargin < yMargin) node.children.sort(compareMinX);
        }

        // total margin of all possible split distributions where each node is at least m full
        _allDistMargin(node, m, M, compare) {
            node.children.sort(compare);

            const toBBox = this.toBBox;
            const leftBBox = distBBox(node, 0, m, toBBox);
            const rightBBox = distBBox(node, M - m, M, toBBox);
            let margin = bboxMargin(leftBBox) + bboxMargin(rightBBox);

            for (let i = m; i < M - m; i++) {
                const child = node.children[i];
                extend(leftBBox, node.leaf ? toBBox(child) : child);
                margin += bboxMargin(leftBBox);
            }

            for (let i = M - m - 1; i >= m; i--) {
                const child = node.children[i];
                extend(rightBBox, node.leaf ? toBBox(child) : child);
                margin += bboxMargin(rightBBox);
            }

            return margin;
        }

        _adjustParentBBoxes(bbox, path, level) {
            // adjust bboxes along the given tree path
            for (let i = level; i >= 0; i--) {
                extend(path[i], bbox);
            }
        }

        _condense(path) {
            // go through the path, removing empty nodes and updating bboxes
            for (let i = path.length - 1, siblings; i >= 0; i--) {
                if (path[i].children.length === 0) {
                    if (i > 0) {
                        siblings = path[i - 1].children;
                        siblings.splice(siblings.indexOf(path[i]), 1);

                    } else this.clear();

                } else calcBBox(path[i], this.toBBox);
            }
        }
    }

    function findItem(item, items, equalsFn) {
        if (!equalsFn) return items.indexOf(item);

        for (let i = 0; i < items.length; i++) {
            if (equalsFn(item, items[i])) return i;
        }
        return -1;
    }

    // calculate node's bbox from bboxes of its children
    function calcBBox(node, toBBox) {
        distBBox(node, 0, node.children.length, toBBox, node);
    }

    // min bounding rectangle of node children from k to p-1
    function distBBox(node, k, p, toBBox, destNode) {
        if (!destNode) destNode = createNode(null);
        destNode.minX = Infinity;
        destNode.minY = Infinity;
        destNode.maxX = -Infinity;
        destNode.maxY = -Infinity;

        for (let i = k; i < p; i++) {
            const child = node.children[i];
            extend(destNode, node.leaf ? toBBox(child) : child);
        }

        return destNode;
    }

    function extend(a, b) {
        a.minX = Math.min(a.minX, b.minX);
        a.minY = Math.min(a.minY, b.minY);
        a.maxX = Math.max(a.maxX, b.maxX);
        a.maxY = Math.max(a.maxY, b.maxY);
        return a;
    }

    function compareNodeMinX(a, b) { return a.minX - b.minX; }
    function compareNodeMinY(a, b) { return a.minY - b.minY; }

    function bboxArea(a)   { return (a.maxX - a.minX) * (a.maxY - a.minY); }
    function bboxMargin(a) { return (a.maxX - a.minX) + (a.maxY - a.minY); }

    function enlargedArea(a, b) {
        return (Math.max(b.maxX, a.maxX) - Math.min(b.minX, a.minX)) *
               (Math.max(b.maxY, a.maxY) - Math.min(b.minY, a.minY));
    }

    function intersectionArea(a, b) {
        const minX = Math.max(a.minX, b.minX);
        const minY = Math.max(a.minY, b.minY);
        const maxX = Math.min(a.maxX, b.maxX);
        const maxY = Math.min(a.maxY, b.maxY);

        return Math.max(0, maxX - minX) *
               Math.max(0, maxY - minY);
    }

    function contains(a, b) {
        return a.minX <= b.minX &&
               a.minY <= b.minY &&
               b.maxX <= a.maxX &&
               b.maxY <= a.maxY;
    }

    function intersects(a, b) {
        return b.minX <= a.maxX &&
               b.minY <= a.maxY &&
               b.maxX >= a.minX &&
               b.maxY >= a.minY;
    }

    function createNode(children) {
        return {
            children,
            height: 1,
            leaf: true,
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity
        };
    }

    // sort an array so that items come in groups of n unsorted items, with groups sorted between each other;
    // combines selection algorithm with binary divide & conquer approach

    function multiSelect(arr, left, right, n, compare) {
        const stack = [left, right];

        while (stack.length) {
            right = stack.pop();
            left = stack.pop();

            if (right - left <= n) continue;

            const mid = left + Math.ceil((right - left) / n / 2) * n;
            quickselect(arr, mid, left, right, compare);

            stack.push(left, mid, mid, right);
        }
    }

    function Linear(context) {
      this._context = context;
    }

    Linear.prototype = {
      areaStart: function() {
        this._line = 0;
      },
      areaEnd: function() {
        this._line = NaN;
      },
      lineStart: function() {
        this._point = 0;
      },
      lineEnd: function() {
        if (this._line || (this._line !== 0 && this._point === 1)) this._context.closePath();
        this._line = 1 - this._line;
      },
      point: function(x, y) {
        x = +x, y = +y;
        switch (this._point) {
          case 0: this._point = 1; this._line ? this._context.lineTo(x, y) : this._context.moveTo(x, y); break;
          case 1: this._point = 2; // falls through
          default: this._context.lineTo(x, y); break;
        }
      }
    };

    function curveLinear$1(context) {
      return new Linear(context);
    }

    var t,e,r,n,i=function(){return i=Object.assign||function(t){for(var e,r=1,n=arguments.length;r<n;r++)for(var i in e=arguments[r])Object.prototype.hasOwnProperty.call(e,i)&&(t[i]=e[i]);return t},i.apply(this,arguments)};function o(t,e,r){if(r||2===arguments.length)for(var n,i=0,o=e.length;i<o;i++)!n&&i in e||(n||(n=Array.prototype.slice.call(e,0,i)),n[i]=e[i]);return t.concat(n||Array.prototype.slice.call(e))}!function(t){t.HEX="HEX",t.RGB="RGB",t.RGBA="RGBA",t.HSL="HSL",t.HSLA="HSLA",t.CMYK="CMYK";}(t||(t={})),function(t){t.ANALOGOUS="ANALOGOUS",t.COMPLEMENTARY="COMPLEMENTARY",t.SPLIT_COMPLEMENTARY="SPLIT_COMPLEMENTARY",t.TRIADIC="TRIADIC",t.TETRADIC="TETRADIC",t.SQUARE="SQUARE";}(e||(e={})),function(t){t.ADDITIVE="ADDITIVE",t.SUBTRACTIVE="SUBTRACTIVE";}(r||(r={})),function(t){t.black="#000000",t.silver="#C0C0C0",t.gray="#808080",t.white="#FFFFFF",t.maroon="#800000",t.red="#FF0000",t.purple="#800080",t.fuchsia="#FF00FF",t.green="#008000",t.lime="#00FF00",t.olive="#808000",t.yellow="#FFFF00",t.navy="#000080",t.blue="#0000FF",t.teal="#008080",t.aqua="#00FFFF",t.orange="#FFA500",t.aliceblue="#F0F8FF",t.antiquewhite="#FAEBD7",t.aquamarine="#7FFFD4",t.azure="#F0FFFF",t.beige="#F5F5DC",t.bisque="#FFE4C4",t.blanchedalmond="#FFEBCD",t.blueviolet="#8A2BE2",t.brown="#A52A2A",t.burlywood="#DEB887",t.cadetblue="#5F9EA0",t.chartreuse="#7FFF00",t.chocolate="#D2691E",t.coral="#FF7F50",t.cornflowerblue="#6495ED",t.cornsilk="#FFF8DC",t.crimson="#DC143C",t.cyan="#00FFFF",t.darkblue="#00008B",t.darkcyan="#008B8B",t.darkgoldenrod="#B8860B",t.darkgray="#A9A9A9",t.darkgreen="#006400",t.darkgrey="#A9A9A9",t.darkkhaki="#BDB76B",t.darkmagenta="#8B008B",t.darkolivegreen="#556B2F",t.darkorange="#FF8C00",t.darkorchid="#9932CC",t.darkred="#8B0000",t.darksalmon="#E9967A",t.darkseagreen="#8FBC8F",t.darkslateblue="#483D8B",t.darkslategray="#2F4F4F",t.darkslategrey="#2F4F4F",t.darkturquoise="#00CED1",t.darkviolet="#9400D3",t.deeppink="#FF1493",t.deepskyblue="#00BFFF",t.dimgray="#696969",t.dimgrey="#696969",t.dodgerblue="#1E90FF",t.firebrick="#B22222",t.floralwhite="#FFFAF0",t.forestgreen="#228B22",t.gainsboro="#DCDCDC",t.ghostwhite="#F8F8FF",t.gold="#FFD700",t.goldenrod="#DAA520",t.greenyellow="#ADFF2F",t.grey="#808080",t.honeydew="#F0FFF0",t.hotpink="#FF69B4",t.indianred="#CD5C5C",t.indigo="#4B0082",t.ivory="#FFFFF0",t.khaki="#F0E68C",t.lavender="#E6E6FA",t.lavenderblush="#FFF0F5",t.lawngreen="#7CFC00",t.lemonchiffon="#FFFACD",t.lightblue="#ADD8E6",t.lightcoral="#F08080",t.lightcyan="#E0FFFF",t.lightgoldenrodyellow="#FAFAD2",t.lightgray="#D3D3D3",t.lightgreen="#90EE90",t.lightgrey="#D3D3D3",t.lightpink="#FFB6C1",t.lightsalmon="#FFA07A",t.lightseagreen="#20B2AA",t.lightskyblue="#87CEFA",t.lightslategray="#778899",t.lightslategrey="#778899",t.lightsteelblue="#B0C4DE",t.lightyellow="#FFFFE0",t.limegreen="#32CD32",t.linen="#FAF0E6",t.magenta="#FF00FF",t.mediumaquamarine="#66CDAA",t.mediumblue="#0000CD",t.mediumorchid="#BA55D3",t.mediumpurple="#9370DB",t.mediumseagreen="#3CB371",t.mediumslateblue="#7B68EE",t.mediumspringgreen="#00FA9A",t.mediumturquoise="#48D1CC",t.mediumvioletred="#C71585",t.midnightblue="#191970",t.mintcream="#F5FFFA",t.mistyrose="#FFE4E1",t.moccasin="#FFE4B5",t.navajowhite="#FFDEAD",t.oldlace="#FDF5E6",t.olivedrab="#6B8E23",t.orangered="#FF4500",t.orchid="#DA70D6",t.palegoldenrod="#EEE8AA",t.palegreen="#98FB98",t.paleturquoise="#AFEEEE",t.palevioletred="#DB7093",t.papayawhip="#FFEFD5",t.peachpuff="#FFDAB9",t.peru="#CD853F",t.pink="#FFC0CB",t.plum="#DDA0DD",t.powderblue="#B0E0E6",t.rosybrown="#BC8F8F",t.royalblue="#4169E1",t.saddlebrown="#8B4513",t.salmon="#FA8072",t.sandybrown="#F4A460",t.seagreen="#2E8B57",t.seashell="#FFF5EE",t.sienna="#A0522D",t.skyblue="#87CEEB",t.slateblue="#6A5ACD",t.slategray="#708090",t.slategrey="#708090",t.snow="#FFFAFA",t.springgreen="#00FF7F",t.steelblue="#4682B4",t.tan="#D2B48C",t.thistle="#D8BFD8",t.tomato="#FF6347",t.turquoise="#40E0D0",t.violet="#EE82EE",t.wheat="#F5DEB3",t.whitesmoke="#F5F5F5",t.yellowgreen="#9ACD32",t.rebeccapurple="#663399";}(n||(n={}));var u,a,s,c,d,f,h,l=Object.keys(n),p=((u={})[t.HEX]=/^#(?:([a-f\d])([a-f\d])([a-f\d])([a-f\d])?|([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?)$/i,u[t.RGB]=/^rgb\s*\(\s*(?:(\d+%)\s*,\s*(\d+%)\s*,\s*(\d+%)|(\d+)\s*,\s*(\d+)\s*,\s*(\d+))\s*\)$/,u[t.RGBA]=/^rgba\s*\(\s*(?:(\d+%)\s*,\s*(\d+%)\s*,\s*(\d+%)|(\d+)\s*,\s*(\d+)\s*,\s*(\d+))\s*,\s*(\d\.?\d*)\s*\)$/,u[t.HSL]=/^hsl\s*\(\s*(-?\d+\.?\d*)\s*,\s*(\d+\.?\d*)%\s*,\s*(\d+\.?\d*)%s*\)$/,u[t.HSLA]=/^hsla\s*\(\s*(-?\d+\.?\d*)\s*,\s*(\d+\.?\d*)%\s*,\s*(\d+\.?\d*)%\s*,\s*(\d\.?\d*)\s*\)$/,u[t.CMYK]=/^(?:device-cmyk|cmyk)\s*\(\s*(?:(\d+\.?\d*%)\s*,\s*(\d+\.?\d*%)\s*,\s*(\d+\.?\d*%)\s*,\s*(\d+\.?\d*%)|(\d\.?\d*)\s*,\s*(\d\.?\d*)\s*,\s*(\d\.?\d*)\s*,\s*(\d\.?\d*))\s*\)$/,u),g=/^(\d+(?:\.\d+)?|\.\d+)%$/,b=/^0x([a-f\d]{1,2})$/i,F="The provided string color doesn't have a correct format",A="The provided color object doesn't have the proper keys or format",m=function(t,e,r){return r<0&&(r+=6),r>=6&&(r-=6),r<1?Math.round(255*((e-t)*r+t)):r<3?Math.round(255*e):r<4?Math.round(255*((e-t)*(4-r)+t)):Math.round(255*t)},y=function(t,e,r){e/=100;var n=(r/=100)<=.5?r*(e+1):r+e-r*e,i=2*r-n;return {r:m(i,n,(t/=60)+2),g:m(i,n,t),b:m(i,n,t-2)}},E=function(t,e,r,n){return n=1-n,{r:Math.round(255*(1-t)*n),g:Math.round(255*(1-e)*n),b:Math.round(255*(1-r)*n)}},H=function(t,e,r){t/=255,e/=255,r/=255;var n=1-Math.max(t,e,r),i=1-n,o=(i-t)/i,u=(i-e)/i,a=(i-r)/i;return {c:Math.round(100*o),m:Math.round(100*u),y:Math.round(100*a),k:Math.round(100*n)}},B=function(t,e,r,n){void 0===n&&(n=1),t/=255,e/=255,r/=255,n=Math.min(n,1);var i=Math.max(t,e,r),o=Math.min(t,e,r),u=i-o,a=0,s=0,c=(i+o)/2;if(0===u)a=0,s=0;else {switch(i){case t:a=(e-r)/u%6;break;case e:a=(r-t)/u+2;break;case r:a=(t-e)/u+4;}(a=Math.round(60*a))<0&&(a+=360),s=u/(1-Math.abs(2*c-1));}return {h:a,s:Math.round(100*s),l:Math.round(100*c),a:n}},v=function(t,e){if(t<0&&(t+=360),t>360&&(t-=360),360===t||0===t)return t;var r=[[0,120],[120,180],[180,240],[240,360]],n=[[0,60],[60,120],[120,240],[240,360]],i=e?n:r,o=0,u=0,a=0,s=0;return (e?r:n).find((function(e,r){return t>=e[0]&&t<e[1]&&(o=e[0],u=e[1],a=i[r][0],s=i[r][1],!0)})),a+(s-a)/(u-o)*(t-o)},M=function(t,e){return Object.prototype.hasOwnProperty.call(t,e)},R=function(t){return g.test(""+t)?+(""+t).replace(g,"$1"):Math.min(+t,100)},S=function(t){return 1===t.length&&(t+=t),parseInt(t,16)},C=function(t){var e=parseInt(""+t).toString(16).toUpperCase();return 1===e.length?"0x0"+e:"0x"+e},L=function(t){var e=parseInt(""+t).toString(16).toUpperCase();return 1===e.length&&(e="0"+e),e},D=function(t,e){return void 0===e&&(e=!1),!e&&g.test(t)?Math.min(255*+t.replace(g,"$1")/100,255):b.test(t)?3===t.length?e?parseInt(t+t.slice(-1))/255:parseInt(t+t.slice(-1)):e?parseInt(t)/255:parseInt(t):Math.min(+t,e?1:255)},G=function(t){return Math.min(g.test(t)?+t.replace(g,"$1")/100:+t,1)},k=function(t){return t.sort().join().toUpperCase()},O=function(t,e){void 0===e&&(e=0);var r=Math.pow(10,e);return Math.round(+t*r)/r},X=function(t,e,r){return Math.max(e,Math.min(t,r))},I=((a={})[t.HEX]=function(t){return "#"+L(t.r)+L(t.g)+L(t.b)+(M(t,"a")&&L(t.a)||"")},a[t.RGB]=function(t){return "rgb"+(M(t,"a")?"a":"")+"("+O(t.r)+","+O(t.g)+","+O(t.b)+(M(t,"a")&&","+O(t.a,2)||"")+")"},a[t.HSL]=function(t){return "hsl"+(M(t,"a")?"a":"")+"("+O(t.h)+","+O(t.s)+"%,"+O(t.l)+"%"+(M(t,"a")&&","+O(t.a,2)||"")+")"},a[t.CMYK]=function(t){return "cmyk("+O(t.c)+"%,"+O(t.m)+"%,"+O(t.y)+"%,"+O(t.k)+"%)"},a),j=function(t){return (t>360||t<0)&&(t-=360*Math.floor(t/360)),t},T=function(t){return isNaN(+t)||t>1?1:O(t,2)},Y=function(t,e,n){return e.reduce((function(e,u){return o(o([],e,!0),[i(i({},t),{h:n===r.ADDITIVE?j(t.h+u):j(v(v(t.h,!1)+u,!0))})],!1)}),[i({},t)])},P=function(t,e){return Y(t,[30,-30],e)},w$1=function(t,e){return Y(t,[180],e)},K=function(t,e){return Y(t,[150,-150],e)},x=function(t,e){return Y(t,[120,-120],e)},N=function(t,e){return Y(t,[60,-120,180],e)},V=function(t,e){return Y(t,[90,-90,180],e)},U=function(e){return "string"==typeof e?function(e){var r;if(Object.keys(t).some((function(t){if(p[t].test(e))return r=t,!0})),!r&&~l.indexOf(e)&&(r=t.HEX),!r)throw new Error(F);return r}(e):function(e){var r,n=!1,i=k(Object.keys(e));if(Object.keys(t).filter((function(e){return e!==t.HEX})).some((function(t){if(k(t.split(""))===i)return r=t,!0})),r&&r===t.RGB||r===t.RGBA){var o=Object.entries(e).map((function(t){return b.test(""+t[1])})),u=Object.entries(e).map((function(t){return g.test(""+t[1])||!b.test(""+t[1])&&!isNaN(+t[1])&&+t[1]<=255})),a=o.some((function(t,e){return e>0&&t!==o[e-1]})),s=u.some((function(t,e){return e>0&&t!==u[e-1]}));!(n=a||s||!o[0]&&!u[0])&&o[0]&&(r=t.HEX);}if(!r||n)throw new Error(A);return r}(e)},$=((s={})[t.HEX]=function(t){var e=(~l.indexOf(t)?n[t]:t).match(p.HEX),r={r:S(e[1]||e[5]),g:S(e[2]||e[6]),b:S(e[3]||e[7])},i=e[4]||e[8];return void 0!==i&&(r.a=S(i)/255),r},s[t.RGB]=function(t){var e=t.match(p.RGB),r=D(e[1]||e[4]),n=D(e[2]||e[5]),i=D(e[3]||e[6]);return {r:Math.min(r,255),g:Math.min(n,255),b:Math.min(i,255)}},s[t.RGBA]=function(t){var e=t.match(p.RGBA),r=D(e[1]||e[4]),n=D(e[2]||e[5]),i=D(e[3]||e[6]),o=+e[7];return {r:Math.min(r,255),g:Math.min(n,255),b:Math.min(i,255),a:T(o)}},s[t.HSL]=function(t){var e=t.match(p.HSL),r=j(+e[1]),n=R(e[2]),i=R(e[3]);return y(r,n,i)},s[t.HSLA]=function(t){var e=t.match(p.HSLA),r=j(+e[1]),n=R(e[2]),i=R(e[3]),o=+e[4],u=y(r,n,i);return u.a=T(o),u},s[t.CMYK]=function(t){var e=t.match(p.CMYK),r=G(e[1]||e[5]),n=G(e[2]||e[6]),i=G(e[3]||e[7]),o=G(e[4]||e[8]);return E(r,n,i,o)},s),q=((c={})[t.HEX]=function(t){var e={r:D(""+t.r),g:D(""+t.g),b:D(""+t.b)};return e.a=M(t,"a")?Math.min(D(""+t.a,!0),1):1,e},c[t.RGB]=function(t){var e=this.HEX(t);return delete e.a,e},c[t.RGBA]=function(t){return this.HEX(t)},c[t.HSL]=function(t){var e=R(""+t.s),r=R(""+t.l);return y(j(t.h),e,r)},c[t.HSLA]=function(t){var e=this.HSL(t);return e.a=T(t.a),e},c[t.CMYK]=function(t){var e=G(""+t.c),r=G(""+t.m),n=G(""+t.y),i=G(""+t.k);return E(e,r,n,i)},c),Q=function(t,e){return void 0===e&&(e=U(t)),"string"==typeof t?$[e](t):q[e](t)},_=((d={})[t.HEX]=function(t){return {r:C(t.r),g:C(t.g),b:C(t.b)}},d.HEXA=function(t){var e=_.HEX(t);return e.a=M(t,"a")?C(255*t.a):"0xFF",e},d[t.RGB]=function(t){return M(t,"a")&&delete t.a,t},d[t.RGBA]=function(t){return t.a=M(t,"a")?O(t.a,2):1,t},d[t.HSL]=function(t){var e=B(t.r,t.g,t.b);return delete e.a,e},d[t.HSLA]=function(t){var e=_.HSL(t);return e.a=M(t,"a")?O(t.a,2):1,e},d[t.CMYK]=function(t){return H(t.r,t.g,t.b)},d),z=function(e,r,n){var o=U(e),u="string"==typeof e,a=Q(e,o),s="string"==typeof e&&M(a,"a")||"string"!=typeof e&&M(e,"a"),c=B(a.r,a.g,a.b,a.a);s||delete c.a;var d=n?c.l/(r+1):(100-c.l)/(r+1),f=Array(r).fill(null).map((function(t,e){return i(i({},c),{l:c.l+d*(e+1)*(1-2*+n)})}));switch(o){case t.HEX:default:return f.map((function(t){var e=y(t.h,t.s,t.l);return s&&(e.a=t.a),u?s?I.HEX(i(i({},e),{a:O(255*e.a,2)})):I.HEX(e):s?_.HEXA(e):_.HEX(e)}));case t.RGB:case t.RGBA:return f.map((function(t){var e=y(t.h,t.s,t.l);return s&&(e.a=t.a),u?I.RGB(e):s?_.RGBA(e):_.RGB(e)}));case t.HSL:case t.HSLA:return f.map((function(t){return u?I.HSL(t):s?_.HSLA(i(i({},y(t.h,t.s,t.l)),{a:t.a})):_.HSL(y(t.h,t.s,t.l))}))}},J=((f={buildHarmony:function(e,r,n){var i=U(e),o=Q(e,i),u=B(o.r,o.g,o.b,o.a),a="string"==typeof e&&M(o,"a")||"string"!=typeof e&&M(e,"a"),s="string"==typeof e;switch(i){case t.HEX:default:return a?this.HEXA(u,r,n,s):this.HEX(u,r,n,s);case t.HSL:return this.HSL(u,r,n,s);case t.HSLA:return this.HSLA(u,r,n,s);case t.RGB:return this.RGB(u,r,n,s);case t.RGBA:return this.RGBA(u,r,n,s)}}})[t.HEX]=function(t,e,r,n){return e(t,r).map((function(t){return n?I.HEX(y(t.h,t.s,t.l)):_.HEX(y(t.h,t.s,t.l))}))},f.HEXA=function(t,e,r,n){return e(t,r).map((function(t){return n?I.HEX(i(i({},y(t.h,t.s,t.l)),{a:255*T(t.a)})):_.HEXA(i(i({},y(t.h,t.s,t.l)),{a:T(t.a)}))}))},f[t.RGB]=function(t,e,r,n){return e(t,r).map((function(t){return n?I.RGB(y(t.h,t.s,t.l)):_.RGB(y(t.h,t.s,t.l))}))},f[t.RGBA]=function(t,e,r,n){return e(t,r).map((function(t){return n?I.RGB(i(i({},y(t.h,t.s,t.l)),{a:T(t.a)})):_.RGBA(i(i({},y(t.h,t.s,t.l)),{a:T(t.a)}))}))},f[t.HSL]=function(t,e,r,n){return e(t,r).map((function(t){return n?I.HSL({h:t.h,s:t.s,l:t.l}):_.HSL(y(t.h,t.s,t.l))}))},f[t.HSLA]=function(t,e,r,n){return e(t,r).map((function(t){return n?I.HSL(i(i({},t),{a:T(t.a)})):_.HSLA(i(i({},y(t.h,t.s,t.l)),{a:T(t.a)}))}))},f),W=((h={mix:function(t,e){var n,o,u,a,s,c,d,f,h,l,p,g,b,F,A,m=t.map((function(t){var e=U(t);return Q(t,e)})),y=e===r.SUBTRACTIVE?m.map((function(t){var e,r,n,i,o,u,a,s,c,d,f,h,l,p,g=(e=t.r,r=t.g,n=t.b,i=Math.min(e,r,n),o=Math.min(255-e,255-r,255-n),u=e-i,a=r-i,s=n-i,c=Math.min(u,a),d=u-c,f=(a+c)/2,h=(s+a-c)/2,l=Math.max(d,f,h)/Math.max(u,a,s),p=isNaN(l)||l===1/0||l<=0?1:l,{r:d/p+o,y:f/p+o,b:h/p+o});return M(t,"a")&&(g.a=t.a),g})):null;function E(t){var n=e===r.ADDITIVE?{r:0,g:0,b:0,a:0}:{r:0,y:0,b:0,a:0};return t.reduce((function(t,n){var o=M(n,"a")?n.a:1,u={r:Math.min(t.r+n.r*o,255),b:Math.min(t.b+n.b*o,255),a:1-(1-o)*(1-t.a)},a="g"in t?t.g:t.y,s="g"in n?n.g:n.y;return i(i({},u),e===r.ADDITIVE?{g:Math.min(a+s*o,255)}:{y:Math.min(a+s*o,255)})}),n)}if(e===r.ADDITIVE)n=E(m);else {var H=E(y);o=H.r,u=H.y,a=H.b,s=Math.min(o,u,a),c=Math.min(255-o,255-u,255-a),d=o-s,f=u-s,h=a-s,l=Math.min(f,h),p=d+f-l,g=f+2*l,b=2*(h-l),F=Math.max(p,g,b)/Math.max(d,f,h),A=isNaN(F)||F===1/0||F<=0?1:F,(n={r:p/A+c,g:g/A+c,b:b/A+c}).a=H.a;}return {r:O(n.r,2),g:O(n.g,2),b:O(n.b,2),a:X(n.a,0,1)}}})[t.HEX]=function(t,e,r){var n=this.mix(t,e);return delete n.a,r?I.HEX(n):_.HEX(n)},h.HEXA=function(t,e,r){var n=this.mix(t,e);return n.a=r?255*T(n.a):T(n.a),r?I.HEX(n):_.HEXA(n)},h[t.RGB]=function(t,e,r){var n=this.mix(t,e);return delete n.a,r?I.RGB(n):_.RGB(n)},h[t.RGBA]=function(t,e,r){var n=this.mix(t,e);return r?I.RGB(n):_.RGBA(n)},h[t.HSL]=function(t,e,r){var n=this.mix(t,e),i=B(n.r,n.g,n.b);return delete n.a,delete i.a,r?I.HSL(i):_.HSL(n)},h[t.HSLA]=function(t,e,r){var n=this.mix(t,e),i=B(n.r,n.g,n.b,n.a);return r?I.HSL(i):_.HSLA(n)},h),Z=function(t,e){return "string"==typeof t&&e||"object"==typeof t&&!e},tt=function(t,e,r,n,i){var o=n(Q(t,e));return r?i(o):o},et=function(t,e,r,n,i,o){r<1&&(r=5);var u=function(t,e,r){var n=r-1,i=(e.r-t.r)/n,o=(e.g-t.g)/n,u=(e.b-t.b)/n,a=T(t.a),s=(T(e.a)-a)/n;return Array(r).fill(null).map((function(r,c){return 0===c?t:c===n?e:{r:O(t.r+i*c),g:O(t.g+o*c),b:O(t.b+u*c),a:O(a+s*c,2)}}))}(Q(t),Q(e),r);return u.map((function(t){var e=i(t);return n?o(e):e}))},rt=function(){function n(t){this.rgb=Q(t),this.updateHSL(),this.updateCMYK();}return n.prototype.updateRGB=function(){this.rgb=i(i({},y(this.hsl.h,this.hsl.s,this.hsl.l)),{a:this.hsl.a});},n.prototype.updateRGBFromCMYK=function(){this.rgb=i(i({},E(this.cmyk.c,this.cmyk.m,this.cmyk.y,this.cmyk.k)),{a:this.rgb.a});},n.prototype.updateHSL=function(){this.hsl=B(this.rgb.r,this.rgb.g,this.rgb.b,this.rgb.a);},n.prototype.updateCMYK=function(){this.cmyk=H(this.rgb.r,this.rgb.g,this.rgb.b);},n.prototype.updateRGBAndCMYK=function(){return this.updateRGB(),this.updateCMYK(),this},n.prototype.updateHSLAndCMYK=function(){return this.updateHSL(),this.updateCMYK(),this},n.prototype.updateRGBAndHSL=function(){return this.updateRGBFromCMYK(),this.updateHSL(),this},n.prototype.setH=function(t){return this.hsl.h=j(t),this.updateRGBAndCMYK()},n.prototype.setS=function(t){return this.hsl.s=X(t,0,100),this.updateRGBAndCMYK()},n.prototype.setL=function(t){return this.hsl.l=X(t,0,100),this.updateRGBAndCMYK()},n.prototype.setR=function(t){return this.rgb.r=X(t,0,255),this.updateHSLAndCMYK()},n.prototype.setG=function(t){return this.rgb.g=X(t,0,255),this.updateHSLAndCMYK()},n.prototype.setB=function(t){return this.rgb.b=X(t,0,255),this.updateHSLAndCMYK()},n.prototype.setA=function(t){return this.hsl.a=this.rgb.a=X(t,0,1),this},n.prototype.setC=function(t){return this.cmyk.c=X(t,0,100),this.updateRGBAndHSL()},n.prototype.setM=function(t){return this.cmyk.m=X(t,0,100),this.updateRGBAndHSL()},n.prototype.setY=function(t){return this.cmyk.y=X(t,0,100),this.updateRGBAndHSL()},n.prototype.setK=function(t){return this.cmyk.k=X(t,0,100),this.updateRGBAndHSL()},Object.defineProperty(n.prototype,"H",{get:function(){return O(this.hsl.h)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"S",{get:function(){return O(this.hsl.s)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"L",{get:function(){return O(this.hsl.l)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"R",{get:function(){return O(this.rgb.r)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"G",{get:function(){return O(this.rgb.g)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"B",{get:function(){return O(this.rgb.b)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"A",{get:function(){return O(this.hsl.a,2)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"C",{get:function(){return O(this.cmyk.c)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"M",{get:function(){return O(this.cmyk.m)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"Y",{get:function(){return O(this.cmyk.y)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"K",{get:function(){return O(this.cmyk.k)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"HEXObject",{get:function(){return _.HEX(this.rgb)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"HEXAObject",{get:function(){return _.HEXA(this.rgb)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"RGBObject",{get:function(){return {r:this.R,g:this.G,b:this.B}},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"RGBAObject",{get:function(){return i(i({},this.RGBObject),{a:this.A})},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"HSLObject",{get:function(){return {h:this.H,s:this.S,l:this.L}},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"HSLAObject",{get:function(){return i(i({},this.HSLObject),{a:this.A})},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"CMYKObject",{get:function(){return {c:this.C,m:this.M,y:this.Y,k:this.K}},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"HEX",{get:function(){var t=this.rgb,e={r:t.r,g:t.g,b:t.b};return I.HEX(e)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"HEXA",{get:function(){var t=this.rgb,e={r:t.r,g:t.g,b:t.b,a:255*this.A};return I.HEX(e)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"RGB",{get:function(){var t=this.rgb,e={r:t.r,g:t.g,b:t.b};return I.RGB(e)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"RGBA",{get:function(){var t=this.rgb,e={r:t.r,g:t.g,b:t.b,a:this.A};return I.RGB(e)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"HSL",{get:function(){var t=this.hsl,e={h:t.h,s:t.s,l:t.l};return I.HSL(e)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"HSLA",{get:function(){return I.HSL(this.hsl)},enumerable:!1,configurable:!0}),Object.defineProperty(n.prototype,"CMYK",{get:function(){return I.CMYK(this.cmyk)},enumerable:!1,configurable:!0}),n.toHEX=function(t,e){void 0===e&&(e=!0);var r=U(t);return tt(t,r,e,_.HEX,I.HEX)},n.toHEXA=function(t,e){void 0===e&&(e=!0);var r=U(t);return tt(t,r,e,_.HEXA,I.HEX)},n.toRGB=function(t,e){void 0===e&&(e=!0);var r=U(t);return tt(t,r,e,_.RGB,I.RGB)},n.toRGBA=function(t,e){void 0===e&&(e=!0);var r=U(t);return tt(t,r,e,_.RGBA,I.RGB)},n.toHSL=function(e,r){void 0===r&&(r=!0);var n=U(e);return n===t.HSL&&Z(e,r)?e:tt(e,n,r,_.HSL,I.HSL)},n.toHSLA=function(e,r){void 0===r&&(r=!0);var n=U(e);return n===t.HSLA&&Z(e,r)?e:tt(e,n,r,_.HSLA,I.HSL)},n.toCMYK=function(e,r){void 0===r&&(r=!0);var n=U(e);return n===t.CMYK&&Z(e,r)?e:tt(e,n,r,_.CMYK,I.CMYK)},n.getBlendHEX=function(t,e,r,n){return void 0===r&&(r=5),void 0===n&&(n=!0),et(t,e,r,n,_.HEX,I.HEX)},n.getBlendHEXA=function(t,e,r,n){return void 0===r&&(r=5),void 0===n&&(n=!0),et(t,e,r,n,_.HEXA,I.HEX)},n.getBlendRGB=function(t,e,r,n){return void 0===r&&(r=5),void 0===n&&(n=!0),et(t,e,r,n,_.RGB,I.RGB)},n.getBlendRGBA=function(t,e,r,n){return void 0===r&&(r=5),void 0===n&&(n=!0),et(t,e,r,n,_.RGBA,I.RGB)},n.getBlendHSL=function(t,e,r,n){return void 0===r&&(r=5),void 0===n&&(n=!0),et(t,e,r,n,_.HSL,I.HSL)},n.getBlendHSLA=function(t,e,r,n){return void 0===r&&(r=5),void 0===n&&(n=!0),et(t,e,r,n,_.HSLA,I.HSL)},n.getMixHEX=function(t,e,n){return void 0===e&&(e=r.ADDITIVE),void 0===n&&(n=!0),W.HEX(t,e,n)},n.getMixHEXA=function(t,e,n){return void 0===e&&(e=r.ADDITIVE),void 0===n&&(n=!0),W.HEXA(t,e,n)},n.getMixRGB=function(t,e,n){return void 0===e&&(e=r.ADDITIVE),void 0===n&&(n=!0),W.RGB(t,e,n)},n.getMixRGBA=function(t,e,n){return void 0===e&&(e=r.ADDITIVE),void 0===n&&(n=!0),W.RGBA(t,e,n)},n.getMixHSL=function(t,e,n){return void 0===e&&(e=r.ADDITIVE),void 0===n&&(n=!0),W.HSL(t,e,n)},n.getMixHSLA=function(t,e,n){return void 0===e&&(e=r.ADDITIVE),void 0===n&&(n=!0),W.HSLA(t,e,n)},n.getShades=function(t,e){return z(t,e,!0)},n.getTints=function(t,e){return z(t,e,!1)},n.getHarmony=function(t,n,i){switch(void 0===n&&(n=e.COMPLEMENTARY),void 0===i&&(i=r.ADDITIVE),n){case e.ANALOGOUS:return J.buildHarmony(t,P,i);case e.SPLIT_COMPLEMENTARY:return J.buildHarmony(t,K,i);case e.TRIADIC:return J.buildHarmony(t,x,i);case e.TETRADIC:return J.buildHarmony(t,N,i);case e.SQUARE:return J.buildHarmony(t,V,i);default:return J.buildHarmony(t,w$1,i)}},n}();

    /* eslint lines-between-class-members: 0 */
    class RecorderBase {
      constructor () {
        this._resetCalls();
      }

      _resetCalls () {
        this._positioningCalls = { call: [], args: [], submarks: [] };
      }

      // Record method calls
      closePath () { addCall(this._positioningCalls, 'closePath', arguments); }
      moveTo () { addCall(this._positioningCalls, 'moveTo', arguments); }
      lineTo () { addCall(this._positioningCalls, 'lineTo', arguments); }
      quadraticCurveTo () { addCall(this._positioningCalls, 'quadraticCurveTo', arguments); }
      bezierCurveTo () { addCall(this._positioningCalls, 'bezierCurveTo', arguments); }
      arcTo () { addCall(this._positioningCalls, 'arcTo', arguments); }
      arc () { addCall(this._positioningCalls, 'arc', arguments); }
      ellipse () { addCall(this._positioningCalls, 'ellipse', arguments); }
      translate () { addCall(this._positioningCalls, 'translate', arguments); }
      rotate () { addCall(this._positioningCalls, 'rotate', arguments); }

      // Custom method to detect multi polygons / multi linestrings
      submarkStart () {
        this._positioningCalls.submarks.push(this._positioningCalls.call.length);
      }
    }

    function addCall (obj, callName, args) {
      obj.call.push(callName);
      obj.args.push(args);
    }

    class RecorderMark extends RecorderBase {
      result () {
        return this._positioningCalls
      }
    }

    class RecorderLayer extends RecorderBase {
      constructor () {
        super();
        this._marks = [];
      }

      markEnd () {
        this._marks.push(this._positioningCalls);
        this._resetCalls();
      }

      result () {
        return this._marks
      }
    }

    class RecorderLabel extends RecorderMark {
      _resetCalls () {
        this._positioningCalls = { call: [], args: [], submarks: [] };
      }
    }

    class RecorderLabelLayer extends RecorderLayer {
      _resetCalls () {
        this._positioningCalls = { call: [], args: [], submarks: [] };
      }
    }

    function recorderMark () {
      return new RecorderMark()
    }

    function recorderLayer () {
      return new RecorderLayer()
    }

    function recorderLabel () {
      return new RecorderLabel()
    }

    function recorderLabelLayer () {
      return new RecorderLabelLayer()
    }

    class BaseContext {
      beginPath () {}
      closePath () {}
      moveTo () {}
      lineTo () {}
      quadraticCurveTo () {}
      bezierCurveTo () {}
      arcTo () {}
      arc () {}
      ellipse () {}
      fill () {}
      stroke () {}
      setLineDash () {}
      fillText () {}
      strokeText () {}
      translate () {}
      rotate () {}
      save () {}
      restore () {}
      rect () {}
      clip () {}
      setTransform () {}

      markStart () {}
      markEnd () {}
      layerStart () {}
      layerEnd () {}
      submarkStart () {}
    }

    // Adapted from https://github.com/d3/d3-path/blob/master/src/path.js#L84
    const pi = Math.PI;
    const tau = 2 * pi;
    const epsilon = 1e-6;
    const tauEpsilon = tau - epsilon;

    function ellipse (pathGen, x, y, rx, ry, rot, a0, a1, ccw) {
      x = +x;
      y = +y;
      rx = +rx;
      ry = +ry;
      ccw = !!ccw;

      const dx = rx * Math.cos(a0);
      const dy = ry * Math.sin(a0);
      const x0 = x + dx;
      const y0 = y + dy;
      const cw = 1 ^ ccw;
      let da = ccw ? a0 - a1 : a1 - a0;

      // Is the radius negative? Error.
      if (rx < 0) throw new Error('negative radius x: ' + rx)
      if (ry < 0) throw new Error('negative radius: ' + ry)

      if (pathGen._x1 === null) {
        // Is this path empty? Move to (x0,y0).
        pathGen._ += 'M' + x0 + ',' + y0;
      } else if (Math.abs(pathGen._x1 - x0) > epsilon || Math.abs(pathGen._y1 - y0) > epsilon) {
        // Or, is (x0,y0) not coincident with the previous point? Line to (x0,y0).
        pathGen._ += 'L' + x0 + ',' + y0;
      }

      // Is this arc empty? We’re done.
      if (!rx) return
      if (!ry) return

      // Does the angle go the wrong way? Flip the direction.
      if (da < 0) da = da % tau + tau;

      if (da > tauEpsilon) {
        // Is this a complete circle? Draw two arcs to complete the circle.
        pathGen._ += 'A' + rx + ',' + ry + ',0,1,' + cw + ',' + (x - dx) + ',' + (y - dy) + 'A' + rx + ',' + ry + ',0,1,' + cw + ',' + (pathGen._x1 = x0) + ',' + (pathGen._y1 = y0);
      } else if (da > epsilon) {
        // Is this arc non-empty? Draw an arc!
        pathGen._ += 'A' + rx + ',' + ry + ',0,' + (+(da >= pi)) + ',' + cw + ',' + (pathGen._x1 = x + rx * Math.cos(a1)) + ',' + (pathGen._y1 = y + ry * Math.sin(a1));
      }
    }

    function getRotation (rotationRadians, x, y) {
      const rotationDegrees = rotationRadians * (180 / Math.PI);
      return `rotate(${rotationDegrees},${x},${y})`
    }

    /* eslint lines-between-class-members: 0 */

    function path$1 () {
      return new Path$1()
    }

    function pathLayer$1 () {
      return new PathLayer$1()
    }

    class BasePath$1 extends BaseContext {
      constructor () {
        super();
        this._pathContext = path();
      }

      _reset () {
        this._pathContext._x0 = null;
        this._pathContext._y0 = null;
        this._pathContext._x1 = null;
        this._pathContext._y1 = null;
        this._pathContext._ = '';

        resetStyles(this, PATH_STYLES);
      }

      closePath () { this._pathContext.closePath(); }
      moveTo (x, y) { this._pathContext.moveTo(x, y); }
      lineTo (x, y) { this._pathContext.lineTo(x, y); }
      quadraticCurveTo () {
        this._pathContext.quadraticCurveTo.apply(this._pathContext, arguments);
      }
      bezierCurveTo () {
        this._pathContext.bezierCurveTo.apply(this._pathContext, arguments);
      }
      arcTo () {
        this._pathContext.arcTo.apply(this._pathContext, arguments);
      }
      arc () {
        this._pathContext.arc.apply(this._pathContext, arguments);
      }
      ellipse (x, y, rx, ry, rot, a0, a1, ccw) {
        ellipse(this._pathContext, x, y, rx, ry, rot, a0, a1, ccw);
      }
      setLineDash (dashArray) {
        this._strokeDashArray = dashArray.join(' ');
      }
    }

    class Path$1 extends BasePath$1 {
      result () {
        const result = getPathData(this);
        this._reset();

        return result
      }
    }

    class PathLayer$1 extends BasePath$1 {
      constructor () {
        super();
        this.marks = [];
      }

      markEnd () {
        this.marks.push(getPathData(this));
        this._reset();
      }

      layerEnd () {
        if (anyStylesActive(this, PATH_STYLES)) {
          for (let i = 0; i < this.marks.length; i++) {
            attachStyles(this.marks[i], this, PATH_STYLES);
          }
        }
      }

      result () {
        const result = this.marks;
        this.marks = [];

        return result
      }
    }

    function getPathData (self) {
      const result = { d: self._pathContext.toString() };

      attachStyles(result, self, PATH_STYLES);

      return result
    }

    const PATH_STYLES = {
      fillStyle: 'fill',
      strokeStyle: 'stroke',
      lineWidth: 'stroke-width',
      _strokeDashArray: 'stroke-dasharray',
      lineCap: 'stroke-linecap',
      lineJoin: 'stroke-linejoin',
      miterLimit: 'stroke-miterlimit',
      lineDashOffset: 'stroke-dashoffset'
    };

    function attachStyles (target, source, styles) {
      for (const styleName in styles) {
        if (source[styleName]) { target[styles[styleName]] = source[styleName]; }
      }
    }

    function anyStylesActive (context, styles) {
      for (const styleName in styles) {
        if (context[styleName]) return true
      }

      return false
    }

    function resetStyles (context, styles) {
      for (const styleName in styles) {
        context[styleName] = undefined;
      }
    }

    function text$1 () {
      return new Text$1()
    }

    function textLayer$1 () {
      return new TextLayer$1()
    }

    class BaseText$1 extends BaseContext {
      constructor () {
        super();
        this._reset();
      }

      _reset () {
        this._currentStyle = {};
        this._currentRotation = null;
      }
      fillText (text, x, y) {
        this._currentStyle.text = text;
        this._currentStyle.fill = this.fillStyle;
      }
      strokeText (text, x, y) {
        this._currentStyle.text = text;
        this._currentStyle.stroke = this.strokeStyle;
        this._currentStyle['stroke-width'] = this.lineWidth;
      }
      translate (x, y) {
        this._currentStyle.x = x;
        this._currentStyle.y = y;
      }
      rotate (rotation) {
        this._currentRotation = rotation;
      }
    }

    class Text$1 extends BaseText$1 {
      result () {
        const result = getTextData$1(this);
        this._reset();

        return result
      }
    }

    class TextLayer$1 extends BaseText$1 {
      constructor () {
        super();
        this.marks = [];
      }

      markEnd () {
        const result = getTextData$1(this);
        this._reset();

        this.marks.push(result);
      }

      result () {
        const result = this.marks;
        this.marks = [];

        return result
      }
    }

    function getTextData$1 (self) {
      const result = self._currentStyle;
      result.style = `font:${self.font};`;
      result['dominant-baseline'] = self.textBaseline;
      result['text-anchor'] = self.textAlign === 'center' ? 'middle' : self.textAlign;

      if (self._currentRotation) {
        result.transform = getRotation(self._currentRotation, result.x, result.y);
      }

      return result
    }

    function circle$1 () {
      return new Circle$1()
    }

    function circleLayer$1 () {
      return new CircleLayer$1()
    }

    class BaseCircle$1 extends BaseContext {
      constructor () {
        super();
        this._currentStyle = {};
      }

      beginPath () {}
      arc (x, y, radius, sAngle, eAngle, counterclockwise) {
        this._currentStyle.cx = x;
        this._currentStyle.cy = y;
        this._currentStyle.r = radius;
      }
      setLineDash (dashArray) {
        this._strokeDashArray = dashArray.join(' ');
      }
    }

    class Circle$1 extends BaseCircle$1 {
      result () {
        const result = getCircleData$1(this);

        this._currentStyle = {};
        resetStyles(this, POINT_STYLES);

        return result
      }
    }

    class CircleLayer$1 extends BaseCircle$1 {
      constructor () {
        super();
        this.marks = [];
      }

      markEnd () {
        const result = getCircleData$1(this);
        this.marks.push(result);

        this._currentStyle = {};
        resetStyles(this, POINT_STYLES);
      }

      layerEnd () {
        if (anyStylesActive(this, POINT_STYLES)) {
          for (let i = 0; i < this.marks.length; i++) {
            attachStyles(this.marks[i], this, POINT_STYLES);
          }
        }
      }

      result () {
        const result = this.marks;
        this.marks = [];

        return result
      }
    }

    function getCircleData$1 (self) {
      const result = self._currentStyle;

      attachStyles(result, self, POINT_STYLES);

      return result
    }

    const POINT_STYLES = {
      fillStyle: 'fill',
      strokeStyle: 'stroke',
      lineWidth: 'stroke-width',
      _strokeDashArray: 'stroke-dasharray',
      lineDashOffset: 'stroke-dashoffset'
    };

    var svgStyled = /*#__PURE__*/Object.freeze({
      __proto__: null,
      path: path$1,
      pathLayer: pathLayer$1,
      text: text$1,
      textLayer: textLayer$1,
      circle: circle$1,
      circleLayer: circleLayer$1
    });

    function chain (...transformers) {
      const lastIndex = transformers.length - 1;

      let result = transformers[lastIndex];

      for (let i = lastIndex - 1; i >= 0; i--) {
        const transformer = transformers[i];

        if (transformer) {
          result = transformer(result);
        }
      }

      result.markEnd = transformers[lastIndex].markEnd
        ? transformers[lastIndex].markEnd.bind(transformers[lastIndex])
        : () => {};

      result.submarkStart = transformers[lastIndex].submarkStart
        ? transformers[lastIndex].submarkStart.bind(transformers[lastIndex])
        : () => {};

      return result
    }

    function Transformer (stream) {
      this.stream = stream;
    }

    Transformer.prototype = {
      constructor: Transformer,
      // Stream
      point (x, y) { this.stream.point(x, y); },
      areaStart () { this.stream.areaStart(); },
      areaEnd () { this.stream.areaEnd(); },
      lineStart () { this.stream.lineStart(); },
      lineEnd () { this.stream.lineEnd(); },
      polygonStart () { this.stream.polygonStart(); },
      polygonEnd () { this.stream.polygonEnd(); },

      // Context
      beginPath () { this.stream.beginPath(); },
      moveTo () { this.stream.moveTo.apply(this.stream, arguments); },
      closePath () { this.stream.closePath(); },
      lineTo () { this.stream.lineTo.apply(this.stream, arguments); },
      quadraticCurveTo () { this.stream.quadraticCurveTo.apply(this.stream, arguments); },
      bezierCurveTo () { this.stream.quadraticCurveTo.apply(this.stream, arguments); },
      arc () { this.stream.arc.apply(this.stream, arguments); },
      arcTo () { this.stream.arcTo.apply(this.stream, arguments); },
      ellipse () { this.stream.ellipse.apply(this.stream, arguments); }
    };

    function getClipId (props, section) {
      const clipType = getClipType(props, section);

      if (clipType === 'padding') {
        return `clip-padding-${section.id}`
      }

      if (clipType === 'outer') {
        return `clip-outer-${section.id}`
      }
    }

    function getClipPathURL (props, section) {
      const clipId = getClipId(props, section);
      if (clipId === undefined) return

      return `url(#${clipId})`
    }

    function getClipType (props, section) {
      return props.clip !== undefined
        ? props.clip
        : section.clip
    }

    function bboxToClipRect ({ minX, minY, maxX, maxY }) {
      return {
        x: minX,
        y: minY,
        width: Math.max(maxX - minX, 0),
        height: Math.max(maxY - minY, 0)
      }
    }

    let canvas;
    let ctx;

    function getCtx () {
      if (!ctx) {
        canvas = document.createElement('canvas');
        ctx = canvas.getContext('2d');
      }
      return ctx
    }

    function aestheticGetter (aesthetic, keys) {
      if (aesthetic === undefined) return () => undefined

      if (aesthetic.constructor === Array) {
        return i => aesthetic[i]
      }

      if (aesthetic.constructor === Function) {
        return keys
          ? i => aesthetic({ index: i, key: keys[i] })
          : i => aesthetic({ index: i, key: i })
      }

      return () => aesthetic
    }

    function batchAestheticGetter (props, aestheticNames, keys) {
      const aestheticGetters = {};

      for (const aestheticName of aestheticNames) {
        if (props[aestheticName] !== undefined) {
          aestheticGetters[aestheticName] = aestheticGetter(props[aestheticName], keys);
        }
      }

      return function (i) {
        const aesthetics = {};

        for (const aestheticName in aestheticGetters) {
          aesthetics[aestheticName] = aestheticGetters[aestheticName](i);
        }

        return aesthetics
      }
    }

    function areAllStylesGlobal (props, aestheticNames) {
      for (let i = 0; i < aestheticNames.length; i++) {
        const aestheticName = aestheticNames[i];

        if (props[aestheticName] === undefined) continue

        if (
          props[aestheticName].constructor === Array ||
          props[aestheticName].constructor === Function
        ) {
          return false
        }
      }

      return true
    }

    function pointInPolygon (point, polygon) {
      const x = point[0];
      const y = point[1];

      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0];
        const yi = polygon[i][1];
        const xj = polygon[j][0];
        const yj = polygon[j][1];

        const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }

      return inside
    }

    function hasStartAndEndCalls (context) {
      return 'markEnd' in context
    }

    function getClipBbox (props, section) {
      const clipType = getClipType$1(props, section);

      if (clipType === 'padding') {
        return section.paddedBbox
      }

      if (clipType === 'outer') {
        return section.bbox
      }
    }

    function getClip (props, section) {
      return clipArgs(getClipBbox(props, section))
    }

    function applyClipping (context, clipping) {
      context.beginPath();
      context.rect.apply(context, clipping);
      context.clip();
    }

    function applyPositioning (context, positioning) {
      for (let i = 0; i < positioning.call.length; i++) {
        context[positioning.call[i]].apply(context, positioning.args[i]);
      }
    }

    function getClipType$1 (props, section) {
      return props.clip !== undefined
        ? props.clip
        : section.clip
    }

    function clipArgs ({ minX, minY, maxX, maxY }) {
      return [
        minX,
        minY,
        maxX - minX,
        maxY - minY
      ]
    }

    let currentId = 0;

    function getId$4 () {
      return 'm' + currentId++
    }

    /** Creates new Mark object. */
    class Mark$1 {
      constructor (
        positioning,
        props,
        section,
        styler,
        type
      ) {
        this.positioning = positioning;
        this.props = props;
        this.section = section;
        this.styler = styler;
        this.type = type;
        this.id = getId$4();
      }

      /**
       * Render mark to context.
       * @param {Object} context A 2d canvas context, or some other rendervous context.
       */
      render (context) {
        context.save();

        hasStartAndEndCalls(context)
          ? this._renderWithStartAndEndCalls(context)
          : this._render(context);

        context.restore();
      }

      /**
       * Updates non-positioning props / aesthetics.
       * @param {Object} aesthetics An object containing the updated values
       */
      updateAesthetics (aesthetics) {
        for (const aestheticName in aesthetics) {
          this.props[aestheticName] = aesthetics[aestheticName];
        }
      }

      // Internal
      _renderWithStartAndEndCalls (context) {
        context.markStart();

        const clip = getClip(this.props, this.section);
        applyClipping(context, clip);

        applyPositioning(context, this.positioning);
        this.styler.apply(context, this.props);

        context.markEnd();
      }

      _render (context) {
        const clip = getClip(this.props, this.section);
        applyClipping(context, clip);

        context.beginPath();
        applyPositioning(context, this.positioning);
        this.styler.apply(context, this.props);
      }
    }

    class SpatialIndex {
      constructor (interactionHandler, getMark, getLayer) {
        this._rbush = new RBush();

        this._interactionHandler = interactionHandler;
        this._getMark = getMark.bind(interactionHandler);
        this._getLayer = getLayer.bind(interactionHandler);
      }

      indexMark (markId) {
        const mark = this._getMark(markId);
        this._rbush.load(mark);
      }

      unindexMark (markId) {
        const mark = this._getMark(markId);
        for (let i = 0; i < mark.length; i++) {
          this._rbush.remove(mark[i]);
        }
      }

      indexLayer (layerId) {
        const layer = this._getLayer(layerId);
        this._rbush.load(layer);
      }

      unindexLayer (layerId) {
        const layer = this._getLayer(layerId);
        for (let i = 0; i < layer.length; i++) {
          this._rbush.remove(layer[i]);
        }
      }

      queryMouseCoordinates ({ x, y }) {
        const potentialHits = this._rbush.search({ minX: x, maxX: x, minY: y, maxY: y });
        return this._getHits(x, y, potentialHits)
      }

      queryBoundingBox (boundingBox) {
        return this._rbush.search(boundingBox)
      }

      _getHits (x, y, potentialHits) {
        const ctx = getCtx();
        const hits = [];

        for (let i = 0; i < potentialHits.length; i++) {
          const potentialHit = potentialHits[i];

          ctx.beginPath();

          const isHit = potentialHit.data.constructor === Mark$1
            ? this._detectCollisionMark(x, y, potentialHit)
            : this._detectCollisionLayer(x, y, potentialHit);

          if (isHit) hits.push(potentialHit);
        }

        return hits
      }

      _detectCollisionMark (x, y, potentialHit) {
        const ctx = getCtx();

        if ('text' in potentialHit.data.props) {
          return detectCollisionText(x, y, potentialHit)
        }

        const markData = potentialHit.data;

        'segment' in potentialHit
          ? runCallsSegment(ctx, markData.positioning, potentialHit.segment)
          : runCalls(ctx, markData.positioning);

        const props = markData.props;

        if (hasFill(props)) {
          if (ctx.isPointInPath(x, y)) return true
        }

        if (hasStroke(props)) {
          ctx.lineWidth = props.strokeWidth;
          if (ctx.isPointInStroke(x, y)) return true
        }

        return false
      }

      _detectCollisionLayer (x, y, potentialHit) {
        const ctx = getCtx();

        if ('text' in potentialHit.data.props) {
          return detectCollisionText(x, y, potentialHit)
        }

        const layerData = potentialHit.data;
        const index = potentialHit.index;
        const positioning = layerData.positioning[index];

        'segment' in potentialHit
          ? runCallsSegment(ctx, positioning, potentialHit.segment)
          : runCalls(ctx, positioning);

        const props = batchAestheticGetter(
          layerData.props,
          ['fill', 'stroke', 'strokeWidth'],
          layerData.props.keys
        )(index);

        if (hasFill(props)) {
          if (ctx.isPointInPath(x, y)) return true
        }

        if (hasStroke(props)) {
          ctx.lineWidth = props.strokeWidth;
          if (ctx.isPointInStroke(x, y)) return true
        }

        return false
      }
    }

    const hasProp = prop => props => props[prop] && props[prop] !== 'none';
    const hasFill = hasProp('fill');
    const hasStroke = hasProp('stroke');

    function runCallsSegment (context, positioning, segment) {
      const lastCoords = getLastCoords(positioning, segment);

      const thisCall = positioning.call[segment];
      const thisArgs = positioning.args[segment];

      const segmentPositioning = {
        call: ['moveTo', thisCall],
        args: [lastCoords, thisArgs]
      };

      runCalls(context, segmentPositioning);
    }

    function getLastCoords (callObj, segment) {
      const lastCall = callObj.call[segment - 1];
      const lastArgs = callObj.args[segment - 1];

      switch (lastCall) {
        case 'moveTo':
          return lastArgs
        case 'lineTo':
          return lastArgs
        case 'quadraticCurveTo':
          return [lastArgs[2], lastArgs[3]]
        case 'bezierCurveTo':
          return [lastArgs[4], lastArgs[5]]
        default:
          throw new Error(`Invalid last call: ${lastCall}`)
      }
    }

    function runCalls (context, positioning) {
      for (let i = 0; i < positioning.call.length; i++) {
        context[positioning.call[i]].apply(context, positioning.args[i]);
      }
    }

    // https://stackoverflow.com/a/67015797/7237112
    function detectCollisionText (x, y, potentialHit) {
      const rotatedBbox = potentialHit.rotatedBbox;
      return pointInPolygon([x, y], rotatedBbox)
    }

    // Taken from https://github.com/rafgraph/detect-it/blob/main/src/index.ts

    const w = typeof window !== 'undefined' ? window : { screen: {}, navigator: {} };
    const matchMedia = w.matchMedia || (() => ({ matches: false }));
    const options = {
      get passive () {
        return (true)
      }
    };

    const noop = () => {};
    w.addEventListener && w.addEventListener('p', noop, options);
    w.removeEventListener && w.removeEventListener('p', noop, false);

    const onTouchStartInWindow = 'ontouchstart' in w;
    const touchEventInWindow = 'TouchEvent' in w;

    const supportsTouchEvents =
      onTouchStartInWindow || (touchEventInWindow && matchMedia('(any-pointer: coarse)').matches);

    const hasTouch = (w.navigator.maxTouchPoints || 0) > 0 || supportsTouchEvents;

    const userAgent = w.navigator.userAgent || '';

    const isIPad =
      matchMedia('(pointer: coarse)').matches &&
      /iPad|Macintosh/.test(userAgent) &&
      Math.min(w.screen.width || 0, w.screen.height || 0) >= 768;

    const hasCoarsePrimaryPointer =
      (matchMedia('(pointer: coarse)').matches ||
      (!matchMedia('(pointer: fine)').matches && onTouchStartInWindow)) &&
      !/Windows.*Firefox/.test(userAgent);

    const hasAnyHoverOrAnyFinePointer =
      matchMedia('(any-pointer: fine)').matches ||
      matchMedia('(any-hover: hover)').matches ||
      isIPad || !onTouchStartInWindow;

    const deviceType =
      hasTouch && (hasAnyHoverOrAnyFinePointer || !hasCoarsePrimaryPointer)
        ? 'hybrid'
        : hasTouch
          ? 'touchOnly'
          : 'mouseOnly';

    const primaryInput =
      deviceType === 'mouseOnly'
        ? 'mouse'
        : deviceType === 'touchOnly'
          ? 'touch'
          : hasCoarsePrimaryPointer
            ? 'touch'
            : 'mouse';

    let handler;
    let _window;

    function initWindow (w) {
      if (w) {
        _window = w;
      } else {
        _window = window;
      }
    }

    class EventTracker {
      constructor (eventManager, { eventName, nativeEventName, useWindow, preventDefault }) {
        this._eventManager = eventManager;
        this._eventName = eventName;
        this._nativeEventName = nativeEventName;
        this._useWindow = useWindow;
        this._preventDefault = preventDefault;

        this._numberOfActiveListeners = 0;
        this._callbacks = {};
      }

      setNativeEventName (nativeEventName) {
        this._nativeEventName = nativeEventName;
      }

      addListener (listenerId, callback) {
        this._callbacks[listenerId] = callback;

        if (this._eventManagerHasBeenMounted()) {
          this._attachNativeListenerIfNecessary();
        }
      }

      attachAllListeners () {
        /* eslint-disable-next-line */
        for (const _ in this._callbacks) {
          this._attachNativeListenerIfNecessary();
        }
      }

      removeListener (listenerId) {
        delete this._callbacks[listenerId];

        if (this._eventManagerHasBeenMounted()) {
          this._removeNativeListenerIfNecessary();
        }
      }

      _eventManagerHasBeenMounted () {
        return this._eventManager._mounted
      }

      _attachNativeListenerIfNecessary () {
        if (this._numberOfActiveListeners === 0) {
          handler = this._handleEvent.bind(this);
          const nativeEventName = this._nativeEventName;

          if (this._useWindow) {
            _window.addEventListener(nativeEventName, handler);
          }

          if (!this._useWindow) {
            this._eventManager._domNode.addEventListener(nativeEventName, handler);
          }
        }

        this._numberOfActiveListeners++;
      }

      _removeNativeListenerIfNecessary () {
        this._numberOfActiveListeners--;

        if (this._numberOfActiveListeners === 0) {
          const nativeEventName = this._nativeEventName;

          if (this._useWindow) {
            _window.removeEventListener(nativeEventName, handler);
          }

          if (!this._useWindow) {
            this._eventManager._domNode.removeEventListener(nativeEventName, handler);
          }
        }
      }

      _handleEvent (nativeEvent) {
        if (this._preventDefault) nativeEvent.preventDefault();

        const screenCoordinates = this._getScreenCoordinates(nativeEvent);
        nativeEvent.eventName = this._eventName;

        for (const listenerId in this._callbacks) {
          this._callbacks[listenerId](screenCoordinates, nativeEvent);
        }
      }

      _getScreenCoordinates (nativeEvent) {
        return this._eventManager._getScreenCoordinates(nativeEvent)
      }
    }

    class BaseEventManager {
      constructor (EXPOSED_EVENTS, managerType) {
        this._domNode = undefined;
        this._svgPoint = undefined;
        this._mounted = false;
        this._trackers = {};
        this._BROWSER_TYPE = undefined;
        this._managerType = managerType;

        for (const event of EXPOSED_EVENTS) {
          this._trackers[event.eventName] = new EventTracker(this, event);
        }
      }

      // Svelte can only bind to DOM nodes after initialization
      addRootNode (domNode, type) {
        this._domNode = domNode;

        if (type === 'svg') {
          this._svgPoint = this._domNode.createSVGPoint();
        }

        // set browser type only after mount
        this._BROWSER_TYPE = window.navigator.pointerEnabled
          ? 'IE11 / MSEdge'
          : window.navigator.msPointerEnabled
            ? 'IE10 / WP8'
            : 'other';

        this._mounted = true;
      }

      attachEventListeners () {
        if (this._mounted === false) throw new Error('root node must be added first')

        for (const eventName in this._trackers) {
          // set native event names here, just before attaching actual listeners
          if (this._managerType === 'mouse') {
            this._trackers[eventName].setNativeEventName(this._getNativeMouseEventName(eventName, this._BROWSER_TYPE));
          }
          if (this._managerType === 'touch') {
            this._trackers[eventName].setNativeEventName(this._getNativeTouchEventName(eventName, this._BROWSER_TYPE));
          }

          this._trackers[eventName].attachAllListeners();
        }
      }

      eventTracker (eventName) {
        return this._trackers[eventName]
      }
    }

    var capitalize = str => str.charAt(0).toUpperCase() + str.slice(1);

    class MouseEventManager extends BaseEventManager {
      constructor () {
        super(EXPOSED_EVENTS, 'mouse');
      }

      _getNativeMouseEventName (exposedEventName, BROWSER_TYPE) {
        // 'click' has the same name in every non-mobile browser
        if (exposedEventName === 'click') return 'click'

        // 'wheel' has the same name in every non-mobile browser
        if (exposedEventName === 'wheel') return 'wheel'

        // In this non-mobile browser type, events are called 'pointerup' etc
        if (BROWSER_TYPE === 'IE11 / MSEdge') {
          const lastPart = sliceOffMouse(exposedEventName);
          return 'pointer' + lastPart
        }

        // In this non-mobile browser type, events are called 'MSPointerUp' etc
        if (BROWSER_TYPE === 'IE10 / WP8') {
          const lastPart = sliceOffMouse(exposedEventName);
          return 'MSPointer' + capitalize(lastPart)
        }

        // In other non-mobile browsers, events are called like the exposed ones
        if (BROWSER_TYPE === 'other') {
          return exposedEventName
        }
      }

      _getScreenCoordinates (nativeEvent) {
        // SVG
        if (this._svgPoint) {
          this._svgPoint.x = nativeEvent.clientX;
          this._svgPoint.y = nativeEvent.clientY;

          return this._svgPoint.matrixTransform(this._domNode.getScreenCTM().inverse())
        }

        // Canvas
        // ????
        const rect = this._domNode.getBoundingBoxClientRect
          ? this._domNode.getBoundingBoxClientRect()
          : this._domNode.getBoundingClientRect();

        const x = nativeEvent.clientX - rect.left;
        const y = nativeEvent.clientY - rect.top;

        return { x, y }
      }
    }

    const EVENT_NAMES = ['mousedown', 'mouseup', 'mousemove', 'mouseout', 'click', 'wheel'];
    const WINDOW_EVENTS = ['mousemove', 'mouseup'];
    const PREVENT_DEFAULT = ['mousedown'];

    const EXPOSED_EVENTS = EVENT_NAMES.map(eventName => ({
      eventName,
      nativeEventName: undefined,
      useWindow: WINDOW_EVENTS.includes(eventName),
      preventDefault: PREVENT_DEFAULT.includes(eventName)
    }));

    const sliceOffMouse = str => str.slice(5, str.length);

    class TouchEventManager extends BaseEventManager {
      constructor () {
        super(EXPOSED_EVENTS$1, 'touch');
      }

      _getNativeTouchEventName (exposedEventName, BROWSER_TYPE) {
        // In this mobile browser type, events are called 'pointerup' etc
        if (BROWSER_TYPE === 'IE11 / MSEdge') {
          const lastPart = sliceOffTouch(exposedEventName);
          return 'pointer' + lastPart
        }

        // In this mobile browser type, events are called 'MSPointerUp' etc
        if (BROWSER_TYPE === 'IE10 / WP8') {
          const lastPart = sliceOffTouch(exposedEventName);
          return 'MSPointer' + capitalize(lastPart)
        }

        // In other mobile browsers, events are called like the exposed ones
        if (BROWSER_TYPE === 'other') {
          return exposedEventName
        }
      }

      _getScreenCoordinates (nativeEvent) {
        const touches = getTouches(nativeEvent);

        if (touches.length === 1) {
          return this._getScreenCoordinatesSingle(touches[0])
        }

        if (touches.length > 1) {
          return this._getScreenCoordinatesMulti(touches)
        }
      }

      _getScreenCoordinatesSingle (touch) {
        // SVG
        if (this._svgPoint) {
          this._svgPoint.x = touch.clientX;
          this._svgPoint.y = touch.clientY;

          return this._svgPoint.matrixTransform(this._domNode.getScreenCTM().inverse())
        }

        // Canvas
        // ????
        const rect = this._domNode.getBoundingBoxClientRect
          ? this._domNode.getBoundingBoxClientRect()
          : this._domNode.getBoundingClientRect();

        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        return { x, y }
      }

      _getScreenCoordinatesMulti (touches) {
        const touchesInScreenCoordinates = [];

        for (const touch of touches) {
          touchesInScreenCoordinates.push(this._getScreenCoordinatesSingle(touch));
        }

        return touchesInScreenCoordinates
      }
    }

    const EVENT_NAMES$1 = ['touchstart', 'touchend', 'touchmove', 'touchcancel'];

    const EXPOSED_EVENTS$1 = EVENT_NAMES$1.map(eventName => ({
      eventName,
      nativeEventName: undefined,
      useWindow: false,
      preventDefault: true
    }));

    const sliceOffTouch = str => str.slice(5, str.length);

    function getTouches (nativeEvent) {
      return nativeEvent.touches
    }

    class EventManager {
      constructor () {
        if (primaryInput === 'mouse') {
          this._mouseEventManager = new MouseEventManager();
        }

        if (primaryInput === 'touch') {
          this._touchEventManager = new TouchEventManager();
        }
      }

      // Initialization
      addRootNode (domNode, type, w) {
        this._forEachManager(manager => { manager.addRootNode(domNode, type); });
        initWindow(w);
      }

      attachEventListeners () {
        this._forEachManager(manager => { manager.attachEventListeners(); });
      }

      mouse () {
        return this._mouseEventManager
      }

      touch () {
        return this._touchEventManager
      }

      _forEachManager (callback) {
        if (this._mouseEventManager) callback(this._mouseEventManager);
        if (this._touchEventManager) callback(this._touchEventManager);
      }
    }

    class BaseInteractionManager {
      constructor () {
        this._id = undefined;
        this._eventManager = undefined;

        this._section = undefined;

        this._markInteractionInterface = undefined;
        this._sectionInteractionInterface = undefined;
      }

      // Initialization
      setId (id) {
        this._id = id;
      }

      linkEventManager (eventManager) {
        this._eventManager = eventManager;
      }

      // Section context loading
      loadSection (sectionData) {
        this._section = sectionData;
      }

      // Mark and layer interactions interface
      marks () {
        return this._markInteractionInterface
      }

      // Section interactions interface
      section () {
        return this._sectionInteractionInterface
      }
    }

    class BaseInteractionInterface {
      constructor (interactionManager, InteractionHandlers) {
        this._interactionManager = interactionManager;
        this._handlers = {};

        for (const handlerName in InteractionHandlers) {
          this._handlers[handlerName] = new InteractionHandlers[handlerName](this._interactionManager);
        }
      }

      _getHandler (interactionName) {
        const handlerName = interactionNameToHandlerName(interactionName);
        return this._handlers[handlerName]
      }
    }

    const interactionNameToHandlerName = interactionName => {
      return capitalize(interactionName) + 'Handler'
    };

    // https://stackoverflow.com/a/55388272
    const PI = Math.PI;
    const HALF_PI = Math.PI / 2;
    const TWO_PI = Math.PI * 2;

    function getArcBbox (cx, cy, radius, _startAngle, _endAngle, counterclockwise) {
      if (_startAngle === 0 && _endAngle === TWO_PI) {
        return {
          minX: cx - radius,
          maxX: cx + radius,
          minY: cy - radius,
          maxY: cy + radius
        }
      }

      let startAngle = _startAngle;
      let endAngle = _endAngle;

      if (counterclockwise) {
        startAngle = _endAngle;
        endAngle = _startAngle;
      }

      const iniQuad = getQuadrant(startAngle);
      const endQuad = getQuadrant(endAngle);

      const ix = Math.cos(startAngle) * radius;
      const iy = Math.sin(startAngle) * radius;
      const ex = Math.cos(endAngle) * radius;
      const ey = Math.sin(endAngle) * radius;

      const minX = Math.min(ix, ex);
      const minY = Math.min(iy, ey);
      const maxX = Math.max(ix, ex);
      const maxY = Math.max(iy, ey);

      const r = radius;
      const xMax = [[maxX, r, r, r], [maxX, maxX, r, r], [maxX, maxX, maxX, r], [maxX, maxX, maxX, maxX]];
      const yMax = [[maxY, maxY, maxY, maxY], [r, maxY, r, r], [r, maxY, maxY, r], [r, maxY, maxY, maxY]];
      const xMin = [[minX, -r, minX, minX], [minX, minX, minX, minX], [-r, -r, minX, -r], [-r, -r, minX, minX]];
      const yMin = [[minY, -r, -r, minY], [minY, minY, -r, minY], [minY, minY, minY, minY], [-r, -r, -r, minY]];

      const x1 = xMin[endQuad][iniQuad];
      const y1 = yMin[endQuad][iniQuad];
      const x2 = xMax[endQuad][iniQuad];
      const y2 = yMax[endQuad][iniQuad];

      return {
        minX: x1 + cx,
        maxX: x2 + cx,
        minY: y1 + cy,
        maxY: y2 + cy
      }
    }

    function getQuadrant (_angle) {
      const angle = _angle % (TWO_PI);

      if (angle > 0.0 && angle < HALF_PI) return 0
      if (angle >= HALF_PI && angle < PI) return 1
      if (angle >= PI && angle < PI + HALF_PI) return 2
      return 3
    }

    function applyLWAndClipping (bbox, props, section) {
      const useLineWidth = props.stroke && props.stroke !== 'none';

      if (useLineWidth) {
        applyMargin(bbox, props.strokeWidth / 2);
      }

      const clipBbox = getClipBbox(props, section);
      applyClip(bbox, clipBbox);

      return bbox
    }

    function applyMargin (bbox, margin) {
      bbox.minX -= margin;
      bbox.maxX += margin;
      bbox.minY -= margin;
      bbox.maxY += margin;
    }

    function applyClip (bbox, clipBbox) {
      bbox.minX = clamp(bbox.minX, clipBbox.minX, clipBbox.maxX);
      bbox.maxX = clamp(bbox.maxX, clipBbox.minX, clipBbox.maxX);
      bbox.minY = clamp(bbox.minY, clipBbox.minY, clipBbox.maxY);
      bbox.maxY = clamp(bbox.maxY, clipBbox.minY, clipBbox.maxY);
    }

    const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

    function bboxPoint (mark) {
      const { positioning, props, section } = mark;
      return [getBbox(positioning, props, section)]
    }

    function bboxPointLayer (layer) {
      const layerBboxes = [];

      const { props, section } = layer;

      const getAesthetics = batchAestheticGetter(props, ['stroke', 'strokeWidth'], props.keys);

      for (let i = 0; i < layer.positioning.length; i++) {
        const bbox = getBbox(
          layer.positioning[i],
          getAesthetics(i),
          section
        );

        bbox.index = i;

        layerBboxes.push(bbox);
      }

      return layerBboxes
    }

    function getBbox (positioning, props, section) {
      for (let i = 0; i < positioning.call.length; i++) {
        if (positioning.call[i] === 'arc') {
          const bbox = getArcBbox.apply(null, positioning.args[i]);

          return applyLWAndClipping(
            bbox,
            props,
            section
          )
        }
      }
    }

    function attach (bboxes, stuffToAttach) {
      for (let i = 0; i < bboxes.length; i++) {
        const bbox = bboxes[i];

        for (const stuffKey in stuffToAttach) {
          bbox[stuffKey] = stuffToAttach[stuffKey];
        }
      }
    }

    function attachWithKeys (bboxes, stuffToAttach, keys) {
      for (let i = 0; i < bboxes.length; i++) {
        const bbox = bboxes[i];

        for (const stuffKey in stuffToAttach) {
          bbox[stuffKey] = stuffToAttach[stuffKey];
        }

        bbox.key = keys[bbox.index];
      }
    }

    function indexPoint (mark) {
      const bboxes = bboxPoint(mark);
      attach(bboxes, { data: mark });

      return bboxes
    }

    function indexPointLayer (layer) {
      const bboxes = bboxPointLayer(layer);

      layer.props.keys
        ? attachWithKeys(bboxes, { data: layer }, layer.props.keys)
        : attach(bboxes, { data: layer });

      return bboxes
    }

    function getBbox$1 (x0, x1, y0, y1) {
      return {
        minX: Math.min(x0, x1),
        maxX: Math.max(x0, x1),
        minY: Math.min(y0, y1),
        maxY: Math.max(y0, y1)
      }
    }

    // https://en.wikipedia.org/wiki/B%C3%A9zier_curve#Quadratic_B%C3%A9zier_curves
    function evalQuadratic (p0, p1, p2, t) {
      return (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2
    }

    function evalCubic (p0, p1, p2, p3, t) {
      return (
        p0 * (1 - t) * (1 - t) * (1 - t) + 3 * p1 * t * (1 - t) *
        (1 - t) + 3 * p2 * t * t * (1 - t) + p3 * t * t * t
      )
    }

    // https://stackoverflow.com/a/24814530
    function getBezierBbox (p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y) {
      let a = 3 * p3x - 9 * p2x + 9 * p1x - 3 * p0x;
      let b = 6 * p0x - 12 * p1x + 6 * p2x;
      let c = 3 * p1x - 3 * p0x;

      let disc = b * b - 4 * a * c;
      let xl = p0x;
      let xh = p0x;
      if (p3x < xl) xl = p3x;
      if (p3x > xh) xh = p3x;
      if (disc >= 0) {
        const t1 = (-b + Math.sqrt(disc)) / (2 * a);

        if (t1 > 0 && t1 < 1) {
          const x1 = evalCubic(p0x, p1x, p2x, p3x, t1);
          if (x1 < xl) xl = x1;
          if (x1 > xh) xh = x1;
        }

        const t2 = (-b - Math.sqrt(disc)) / (2 * a);

        if (t2 > 0 && t2 < 1) {
          const x2 = evalCubic(p0x, p1x, p2x, p3x, t2);
          if (x2 < xl) xl = x2;
          if (x2 > xh) xh = x2;
        }
      }

      a = 3 * p3y - 9 * p2y + 9 * p1y - 3 * p0y;
      b = 6 * p0y - 12 * p1y + 6 * p2y;
      c = 3 * p1y - 3 * p0y;
      disc = b * b - 4 * a * c;

      let yl = p0y;
      let yh = p0y;

      if (p3y < yl) yl = p3y;
      if (p3y > yh) yh = p3y;
      if (disc >= 0) {
        const t1 = (-b + Math.sqrt(disc)) / (2 * a);

        if (t1 > 0 && t1 < 1) {
          const y1 = evalCubic(p0y, p1y, p2y, p3y, t1);
          if (y1 < yl) yl = y1;
          if (y1 > yh) yh = y1;
        }

        const t2 = (-b - Math.sqrt(disc)) / (2 * a);

        if (t2 > 0 && t2 < 1) {
          const y2 = evalCubic(p0y, p1y, p2y, p3y, t2);
          if (y2 < yl) yl = y2;
          if (y2 > yh) yh = y2;
        }
      }

      return getBbox$1(xl, xh, yl, yh)
    }

    // https://stackoverflow.com/a/63059651
    function quadraticToCubic (x1, y1, cpx, cpy, x2, y2) {
      return [
        x1 / 3 + (2 / 3) * cpx,
        y1 / 3 + (2 / 3) * cpy,
        x2 / 3 + (2 / 3) * cpx,
        y2 / 3 + (2 / 3) * cpy,
        x2,
        y2
      ]
    }

    function getQuadraticBbox (x0, y0, x1, y1, x2, y2) {
      return getBezierBbox.apply(
        null,
        quadraticToCubic(x0, y0, x1, y1, x2, y2)
      )
    }

    function getEllipseBbox (x, y, rx, ry, rot, a0, a1, ccw) {
      if (rot !== 0) throw Error('Rotation not supported yet')

      const dimRatio = rx / ry;
      const r = dimRatio > 1 ? rx : ry;

      const bbox = getArcBbox(x, y, r, a0, a1, ccw);
      rescaleBbox(bbox, dimRatio);

      return bbox
    }

    function getEllipseEndCoords (x, y, rx, ry, rot, a0, a1) {
      const endX = Math.cos(a1) * rx;
      const endY = Math.sin(a1) * ry;

      return [x + endX, y + endY]
    }

    function rescaleBbox (bbox, dimRatio) {
      if (dimRatio < 1) {
        const cx = (bbox.minX + bbox.maxX) / 2;
        const dxMin = cx - bbox.minX;
        const dxMax = bbox.maxX - cx;

        bbox.minX = cx - (dxMin * dimRatio);
        bbox.maxX = cx + (dxMax * dimRatio);
      }

      if (dimRatio > 1) {
        const cy = (bbox.minY + bbox.maxY) / 2;
        const dyMin = cy - bbox.minY;
        const dyMax = bbox.maxY - cy;

        bbox.minY = cy - (dyMin / dimRatio);
        bbox.maxY = cy + (dyMax / dimRatio);
      }
    }

    function updateBbox (bbox, x, y) {
      bbox.minX = x < bbox.minX ? x : bbox.minX;
      bbox.maxX = x > bbox.maxX ? x : bbox.maxX;
      bbox.minY = y < bbox.minY ? y : bbox.minY;
      bbox.maxY = y > bbox.maxY ? y : bbox.maxY;
    }

    function updateBboxWithBbox (bbox, { minX, maxX, minY, maxY }) {
      bbox.minX = minX < bbox.minX ? minX : bbox.minX;
      bbox.maxX = maxX > bbox.maxX ? maxX : bbox.maxX;
      bbox.minY = minY < bbox.minY ? minY : bbox.minY;
      bbox.maxY = maxY > bbox.maxY ? maxY : bbox.maxY;
    }

    /* eslint-disable no-case-declarations */

    function bboxPolygon (mark) {
      const bboxes = [];

      const { positioning, props, section } = mark;

      const submarks = positioning.submarks.length
        ? positioning.submarks
        : [0];

      for (let i = 0; i < submarks.length; i++) {
        const submarkStart = submarks[i];
        const submarkEnd = submarks[i + 1] || positioning.call.length;

        bboxes.push(getBboxOfRange(
          positioning,
          props,
          section,
          submarkStart,
          submarkEnd
        ));
      }

      return bboxes
    }

    function bboxPolygonLayer (layer) {
      const layerBboxes = [];

      const { props, section } = layer;

      const getAesthetics = batchAestheticGetter(props, ['stroke', 'strokeWidth'], props.keys);

      for (let i = 0; i < layer.positioning.length; i++) {
        const positioning = layer.positioning[i];

        const submarks = positioning.submarks.length
          ? positioning.submarks
          : [0];

        for (let j = 0; j < submarks.length; j++) {
          const submarkStart = submarks[j];
          const submarkEnd = submarks[j + 1] || positioning.call.length;

          const bbox = getBboxOfRange(
            positioning,
            getAesthetics(i),
            section,
            submarkStart,
            submarkEnd
          );

          bbox.index = i;

          layerBboxes.push(bbox);
        }
      }

      return layerBboxes
    }

    function getBboxOfRange (
      positioning,
      props,
      section,
      start,
      end
    ) {
      const bbox = {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity
      };

      let numberOfMoveTos = 0;
      let lastX;
      let lastY;

      for (let i = start; i < end; i++) {
        const call = positioning.call[i];
        const args = positioning.args[i];

        switch (call) {
          case 'moveTo':
            // This ignores holes
            numberOfMoveTos++;

            if (numberOfMoveTos === 2) {
              return applyLWAndClipping(
                bbox,
                props,
                section
              )
            }

            lastX = args[0];
            lastY = args[1];
            break
          case 'lineTo':
            updateBbox(bbox, lastX, lastY);
            lastX = args[0];
            lastY = args[1];
            updateBbox(bbox, lastX, lastY);
            break
          case 'quadraticCurveTo':
            updateBboxWithBbox(
              bbox,
              getQuadraticBbox(lastX, lastY, ...args)
            );
            lastX = args[2];
            lastY = args[3];
            break
          case 'bezierCurveTo':
            updateBboxWithBbox(
              bbox,
              getBezierBbox(lastX, lastY, ...args)
            );
            lastX = args[4];
            lastY = args[5];
            break
          case 'ellipse':
            updateBboxWithBbox(
              bbox,
              getEllipseBbox.apply(null, args)
            );
            const endCoords = getEllipseEndCoords.apply(null, args);
            lastX = endCoords[0];
            lastY = endCoords[1];
            break
        }
      }

      return applyLWAndClipping(
        bbox,
        props,
        section
      )
    }

    function indexRectangle (mark) {
      const bboxes = bboxPolygon(mark);
      attach(bboxes, { data: mark });

      return bboxes
    }

    function indexRectangleLayer (layer) {
      const bboxes = bboxPolygonLayer(layer);

      layer.props.keys
        ? attachWithKeys(bboxes, { data: layer }, layer.props.keys)
        : attach(bboxes, { data: layer });

      return bboxes
    }

    function indexPolygon (mark) {
      const bboxes = bboxPolygon(mark);
      attach(bboxes, { data: mark });

      return bboxes
    }

    function indexPolygonLayer (layer) {
      const bboxes = bboxPolygonLayer(layer);

      layer.props.keys
        ? attachWithKeys(bboxes, { data: layer }, layer.props.keys)
        : attach(bboxes, { data: layer });

      return bboxes
    }

    function bboxLabel (mark) {
      const { positioning, props, section } = mark;
      return [getBbox$2(positioning, props, section)]
    }

    function bboxLabelLayer (layer) {
      const layerBboxes = [];

      const { props, section } = layer;

      const getAesthetics = batchAestheticGetter(
        props,
        ['text', 'fontSize', 'rotate', 'anchorPoint', 'stroke', 'strokeWidth'],
        props.keys
      );

      for (let i = 0; i < layer.positioning.length; i++) {
        const bbox = getBbox$2(
          layer.positioning[i],
          getAesthetics(i),
          section
        );

        bbox.index = i;

        layerBboxes.push(bbox);
      }

      return layerBboxes
    }

    function getBbox$2 (positioning, props, section) {
      const ctx = getCtx();
      ctx.save();

      const width = ctx.measureText(props.text).width;
      const height = props.fontSize;
      const [x0, y0] = getXY0(props, width, height);
      const x1 = x0 + width;
      const y1 = y0 + height;

      const bboxAround0Points = [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1]
      ];

      ctx.translate.apply(ctx, positioning.args[0]);
      ctx.rotate(props.rotate);

      // Again, necessary bc of unit tests (getTransform not defined in canvas package)
      const transformation = ctx.getTransform
        ? ctx.getTransform()
        : ctx.currentTransform;

      const rotatedPoints = bboxAround0Points.map(([x, y]) => {
        const rotatedPoint = transformation.transformPoint({ x, y });
        return [rotatedPoint.x, rotatedPoint.y]
      });

      ctx.restore();

      const bboxRotatedPoints = getBboxPoints(rotatedPoints);
      const bbox = applyLWAndClipping(bboxRotatedPoints, props, section);
      bbox.rotatedBbox = rotatedPoints;

      return bbox
    }

    function getXY0 ({ anchorPoint }, w, h) {
      const x = anchorPoint.startsWith('l')
        ? 0
        : anchorPoint.startsWith('r')
          ? -w
          : -w / 2;

      const y = anchorPoint.endsWith('t')
        ? 0
        : anchorPoint.endsWith('b')
          ? -h
          : -h / 2;

      return [x, y]
    }

    function getBboxPoints (points) {
      const bbox = {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity
      };

      for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i];
        updateBbox(bbox, x, y);
      }

      return bbox
    }

    function indexLabel (mark) {
      const bboxes = bboxLabel(mark);
      attach(bboxes, { data: mark });

      return bboxes
    }

    function indexLabelLayer (layer) {
      const bboxes = bboxLabelLayer(layer);

      layer.props.keys
        ? attachWithKeys(bboxes, { data: layer }, layer.props.keys)
        : attach(bboxes, { data: layer });

      return bboxes
    }

    function bboxLine (mark) {
      const { positioning, props, section } = mark;
      return getBboxes(positioning, props, section)
    }

    function bboxLineLayer (layer) {
      const layerBboxes = [];

      const { props, section } = layer;

      const getAesthetics = batchAestheticGetter(props, ['stroke', 'strokeWidth'], props.keys);

      for (let i = 0; i < layer.positioning.length; i++) {
        const bboxes = getBboxes(
          layer.positioning[i],
          getAesthetics(i),
          section
        );

        for (let j = 0; j < bboxes.length; j++) {
          bboxes[j].index = i;
          layerBboxes.push(bboxes[j]);
        }
      }

      return layerBboxes
    }

    function getBboxes (positioning, props, section) {
      const bboxes = [];

      let lastX;
      let lastY;

      let bbox;

      for (let i = 0; i < positioning.call.length; i++) {
        const call = positioning.call[i];
        const args = positioning.args[i];

        switch (call) {
          case 'moveTo':
            lastX = args[0];
            lastY = args[1];
            break
          case 'lineTo':
            bbox = applyLWAndClipping(
              getBbox$1(lastX, args[0], lastY, args[1]),
              props,
              section
            );

            bbox.segment = i;

            bboxes.push(bbox);

            lastX = args[0];
            lastY = args[1];
            break
          case 'quadraticCurveTo':
            bbox = applyLWAndClipping(
              getQuadraticBbox(lastX, lastY, ...args),
              props,
              section
            );

            bbox.segment = i;

            bboxes.push(bbox);

            lastX = args[2];
            lastY = args[3];
            break
          case 'bezierCurveTo':
            bbox = applyLWAndClipping(
              getBezierBbox(lastX, lastY, ...args),
              props,
              section
            );

            bbox.segment = i;

            bboxes.push(bbox);

            lastX = args[4];
            lastY = args[5];
            break
        }
      }

      return bboxes
    }

    function indexLine (mark) {
      const bboxes = bboxLine(mark);
      attach(bboxes, { data: mark });

      return bboxes
    }

    function indexLineLayer (layer) {
      const bboxes = bboxLineLayer(layer);

      layer.props.keys
        ? attachWithKeys(bboxes, { data: layer }, layer.props.keys)
        : attach(bboxes, { data: layer });

      return bboxes
    }

    function indexArea (mark) {
      const bboxes = bboxPolygon(mark);
      attach(bboxes, { data: mark });

      return bboxes
    }

    function indexAreaLayer (layer) {
      const bboxes = bboxPolygonLayer(layer);

      layer.props.keys
        ? attachWithKeys(bboxes, { data: layer }, layer.props.keys)
        : attach(bboxes, { data: layer });

      return bboxes
    }

    function indexSymbol (mark) {
      const bboxes = bboxPolygon(mark);
      attach(bboxes, { data: mark });

      return bboxes
    }

    function indexSymbolLayer (layer) {
      const bboxes = bboxPolygonLayer(layer);

      layer.props.keys
        ? attachWithKeys(bboxes, { data: layer }, layer.props.keys)
        : attach(bboxes, { data: layer });

      return bboxes
    }

    const markIndexing = {
      Point: indexPoint,
      Rectangle: indexRectangle,
      Polygon: indexPolygon,
      Line: indexLine,
      Area: indexArea,
      Symbol: indexSymbol,
      Label: indexLabel,
      FuncLine: indexLine
    };

    const layerIndexing = {
      Point: indexPointLayer,
      Rectangle: indexRectangleLayer,
      Polygon: indexPolygonLayer,
      Line: indexLineLayer,
      Label: indexLabelLayer,
      Area: indexAreaLayer,
      Symbol: indexSymbolLayer
    };

    class MarkInteractionInterface extends BaseInteractionInterface {
      constructor (interactionManager, InteractionHandlers) {
        super(interactionManager, InteractionHandlers);

        this._indexableMarks = {};
        this._indexableLayers = {};
      }

      // Mark loading and removing
      loadMark (mark) {
        const indexingFunction = markIndexing[mark.type];
        const indexableMark = indexingFunction(mark);

        const markId = mark.id;
        this._indexableMarks[markId] = indexableMark;
      }

      markIsLoaded ({ id }) {
        return id in this._indexableMarks
      }

      removeMark ({ id }) {
        delete this._indexableMarks[id];
      }

      // Layer loading and removing
      loadLayer (layer) {
        const indexingFunction = layerIndexing[layer.type];
        const indexableLayer = indexingFunction(layer);

        const layerId = layer.id;
        this._indexableLayers[layerId] = indexableLayer;
      }

      layerIsLoaded ({ id }) {
        return id in this._indexableLayers
      }

      removeLayer ({ id }) {
        delete this._indexableLayers[id];
      }

      // Add/remove mark interactions
      addMarkInteraction (interactionName, { id }, callback) {
        this._getHandler(interactionName).addMarkInteraction(id, callback);
      }

      removeAllMarkInteractions ({ id }) {
        for (const handlerName in this._handlers) {
          const handler = this._handlers[handlerName];

          if (handler.hasMark(id)) {
            handler.removeMarkInteraction(id);
          }
        }
      }

      // Add/remove layer interactions
      addLayerInteraction (interactionName, { id }, callback) {
        this._getHandler(interactionName).addLayerInteraction(id, callback);
      }

      removeAllLayerInteractions ({ id }) {
        for (const handlerName in this._handlers) {
          const handler = this._handlers[handlerName];

          if (handler.hasLayer(id)) {
            handler.removeLayerInteraction(id);
          }
        }
      }
    }

    class SectionInteractionInterface extends BaseInteractionInterface {
      addInteraction (interactionName, callback) {
        this._getHandler(interactionName).addInteraction(callback);
      }

      removeAllInteractions () {
        for (const handlerName in this._handlers) {
          const handler = this._handlers[handlerName];

          if (handler.hasInteraction()) {
            handler.removeInteraction();
          }
        }
      }
    }

    class BaseInteractionHandler {
      constructor (interactionManager, { eventName, interactionName }) {
        this._interactionManager = interactionManager;
        this._eventName = eventName;
        this._interactionName = interactionName;
      }

      interactionManager () {
        return this._interactionManager
      }

      eventManager () {
        return this._interactionManager._eventManager
      }

      section () {
        return this._interactionManager._section
      }

      id () {
        return this._interactionManager._id
      }

      _addEventListener () {
        const handler = this._handleEvent.bind(this);

        const eventManager = this.eventManager();
        const listenerId = this.getId();

        const events = isArray(this._eventName) ? this._eventName : [this._eventName];

        for (const event of events) {
          eventManager
            .eventTracker(event)
            .addListener(listenerId, handler);
        }
      }

      _removeEventListener () {
        const eventManager = this.eventManager();
        const listenerId = this.getId();

        const events = isArray(this._eventName) ? this._eventName : [this._eventName];

        for (const event of events) {
          eventManager
            .eventTracker(event)
            .removeListener(listenerId);
        }
      }
    }

    function isArray (value) {
      return value.constructor === Array
    }

    class MarkInteractionHandler extends BaseInteractionHandler {
      constructor (interactionManager, options) {
        super(interactionManager, options);

        const getMark = function (markId) {
          return this._interactionManager.marks()._indexableMarks[markId]
        };

        const getLayer = function (layerId) {
          return this._interactionManager.marks()._indexableLayers[layerId]
        };

        this._spatialIndex = new SpatialIndex(this, getMark, getLayer);

        this._numberOfInteractions = 0;

        this._markCallbacks = {};
        this._layerCallbacks = {};
      }

      // Add/remove mark interactions
      addMarkInteraction (markId, callback) {
        this._addEventListenerIfNecessary();
        this._numberOfInteractions++;
        this._markCallbacks[markId] = callback;

        this._spatialIndex.indexMark(markId);
      }

      hasMark (markId) {
        return markId in this._markCallbacks
      }

      removeMarkInteraction (markId) {
        this._removeEventListenerIfNecessary();
        delete this._markCallbacks[markId];
        this._numberOfInteractions--;

        this._spatialIndex.unindexMark(markId);
      }

      // Add/remove layer interactions
      addLayerInteraction (layerId, callback) {
        if (!(layerId in this._layerCallbacks)) {
          this._addEventListenerIfNecessary();
          this._numberOfInteractions++;
          this._layerCallbacks[layerId] = callback;

          this._spatialIndex.indexLayer(layerId);
        }
      }

      hasLayer (layerId) {
        return layerId in this._layerCallbacks
      }

      removeLayerInteraction (layerId) {
        if (layerId in this._layerCallbacks) {
          this._numberOfInteractions--;
          delete this._layerCallbacks[layerId];
          this._removeEventListenerIfNecessary();

          this._spatialIndex.unindexLayer(layerId);
        }
      }

      _addEventListenerIfNecessary () {
        if (this._numberOfInteractions === 0) {
          this._addEventListener();
        }
      }

      _removeEventListenerIfNecessary () {
        if (this._numberOfInteractions === 0) {
          this._removeEventListener();
        }
      }

      getId () {
        return `${this.id()}-mark-${this._interactionName}`
      }
    }

    function createMarkEvent (eventType, eventOptions, hit, nativeEvent) {
      eventOptions.markType = hit.data.type;
      eventOptions.hitBbox = extractBbox(hit);
      eventOptions.hitSource = 'mark';

      return createEvent(eventType, eventOptions, nativeEvent)
    }

    function createLayerEvent (eventType, eventOptions, hit, nativeEvent) {
      eventOptions.markType = hit.data.type;
      eventOptions.hitBbox = extractBbox(hit);
      eventOptions.key = hit.key;
      eventOptions.index = hit.index;
      eventOptions.hitSource = 'layer';

      return createEvent(eventType, eventOptions, nativeEvent)
    }

    function createSectionEvent (eventType, eventOptions, nativeEvent) {
      eventOptions.hitSource = 'section';

      return createEvent(eventType, eventOptions, nativeEvent)
    }

    function extractBbox (hit) {
      return { minX: hit.minX, maxX: hit.maxX, minY: hit.minY, maxY: hit.maxY }
    }

    function createEvent (eventType, eventOptions, nativeEvent) {
      const event = eventOptions;

      event.type = eventType;
      event.nativeType = nativeEvent.type;

      for (const key of INTERESTING_NATIVE_KEYS) {
        event[key] = nativeEvent[key];
      }

      return event
    }

    const INTERESTING_NATIVE_KEYS = [
      'altKey', 'ctrlKey', 'shiftKey',
      'clientX', 'clientY',
      'pageX', 'pageY',
      'screenX', 'screenY',
      'timeStamp'
    ];

    function createSelectMarkEvent (eventType, hit) {
      const event = {
        type: eventType,
        markType: hit.data.type,
        hitSource: 'mark'
      };

      return event
    }

    function createSelectLayerEvent (eventType, hit) {
      const event = {
        type: eventType,
        markType: hit.data.type,
        key: hit.key,
        index: hit.index,
        hitSource: 'layer'
      };

      return event
    }

    function getLocalCoordinates (screenCoordinates, interactionManager) {
      const section = interactionManager._section;
      const inverseTotalTransformation = section.inverseTotalTransformation;

      const { minX, maxX, minY, maxY } = section.paddedBbox;

      const clampedX = clamp$1(screenCoordinates.x, minX, maxX);
      const clampedY = clamp$1(screenCoordinates.y, minY, maxY);

      const [localX, localY] = inverseTotalTransformation([clampedX, clampedY]);

      return { x: localX, y: localY }
    }

    function clamp$1 (value, min, max) {
      return Math.max(min, Math.min(value, max))
    }

    let currentId$1 = 0;

    function getId$1$1 () {
      return 'l' + currentId$1++
    }

    /** Creates new Layer object. */
    class Layer$1 {
      constructor (
        positioning,
        props,
        section,
        styler,
        type
      ) {
        this.positioning = positioning;
        this.props = props;
        this.section = section;
        this.styler = styler;
        this.type = type;
        this.id = getId$1$1();
      }

      /**
       * Render layer to context.
       * @param {Object} context A 2d canvas context, or some other rendervous context.
       */
      render (context) {
        context.save();

        hasStartAndEndCalls(context)
          ? this._renderWithStartAndEndCalls(context)
          : this._render(context);

        context.restore();
      }

      /**
       * Updates non-positioning props / aesthetics.
       * @param {Object} aesthetics An object containing the updated values
       */
      updateAesthetics (aesthetics) {
        for (const aestheticName in aesthetics) {
          this.props[aestheticName] = aesthetics[aestheticName];
        }
      }

      // Internal
      _renderWithStartAndEndCalls (context) {
        context.layerStart();

        const clip = getClip(this.props, this.section);
        applyClipping(context, clip);

        const asOnePath = this.styler.asOnePath(this.props);
        const applyStyling = this.styler.create(this.props);

        if (asOnePath) {
          context.markStart();

          for (let i = 0; i < this.positioning.length; i++) {
            applyPositioning(context, this.positioning[i]);
          }

          applyStyling(context);

          context.markEnd();
        }

        if (!asOnePath) {
          for (let i = 0; i < this.positioning.length; i++) {
            context.markStart();

            applyPositioning(context, this.positioning[i]);
            applyStyling(context, i);

            context.markEnd();
          }
        }

        context.layerEnd();
      }

      _render (context) {
        const clip = getClip(this.props, this.section);
        applyClipping(context, clip);

        const asOnePath = this.styler.asOnePath(this.props);
        const applyStyling = this.styler.create(this.props);

        if (asOnePath) {
          context.beginPath();

          for (let i = 0; i < this.positioning.length; i++) {
            applyPositioning(context, this.positioning[i]);
          }

          applyStyling(context);
        }

        if (!asOnePath) {
          for (let i = 0; i < this.positioning.length; i++) {
            context.beginPath();
            applyPositioning(context, this.positioning[i]);
            applyStyling(context, i);
          }
        }
      }
    }

    function coordinatesAreInsideSection ({ x, y }, section) {
      const bbox = section.bbox;

      return (
        x >= bbox.minX &&
        x <= bbox.maxX &&
        y >= bbox.minY &&
        y <= bbox.maxY
      )
    }

    function hitIsMark (hit) {
      return hit.data.constructor === Mark$1
    }

    function hitIsInLayer (hit) {
      return hit.data.constructor === Layer$1
    }

    function getHitId (hit) {
      if (hitIsMark(hit)) return hit.data.id
      if (hitIsInLayer(hit)) return hit.data.id + '-' + hit.index
    }

    class ClickHandler extends MarkInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'click',
          eventName: 'click'
        });
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        if (!coordinatesAreInsideSection(screenCoordinates, this.section())) {
          return
        }

        const spatialIndex = this._spatialIndex;
        const hits = spatialIndex.queryMouseCoordinates(screenCoordinates);
        const localCoordinates = getLocalCoordinates(screenCoordinates, this.interactionManager());

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];

          if (hitIsMark(hit)) {
            const clickEvent = createMarkEvent('click', {
              screenCoordinates,
              localCoordinates
            }, hit, nativeEvent);

            this._markCallbacks[hit.data.id](clickEvent);
          }

          if (hitIsInLayer(hit)) {
            const clickEvent = createLayerEvent('click', {
              screenCoordinates,
              localCoordinates
            }, hit, nativeEvent);

            this._layerCallbacks[hit.data.id](clickEvent);
          }
        }
      }
    }

    class MouseoverHandler extends MarkInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'mouseover',
          eventName: 'mousemove'
        });

        this._previousMouseoverIds = {};
        this._currentMouseoverIds = {};
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        const spatialIndex = this._spatialIndex;
        const hits = spatialIndex.queryMouseCoordinates(screenCoordinates);

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];
          const hitId = getHitId(hit);

          this._currentMouseoverIds[hitId] = true;

          if (!(hitId in this._previousMouseoverIds)) {
            this._fireCallback(hit, screenCoordinates, nativeEvent);
          }
        }

        this._previousMouseoverIds = this._currentMouseoverIds;
        this._currentMouseoverIds = {};
      }

      _fireCallback (hit, screenCoordinates, nativeEvent) {
        const localCoordinates = getLocalCoordinates(screenCoordinates, this.interactionManager());

        if (hitIsMark(hit)) {
          const mouseoverEvent = createMarkEvent('mouseover', {
            screenCoordinates,
            localCoordinates
          }, hit, nativeEvent);

          this._markCallbacks[hit.data.id](mouseoverEvent);
        }

        if (hitIsInLayer(hit)) {
          const mouseoverEvent = createLayerEvent('mouseover', {
            screenCoordinates,
            localCoordinates
          }, hit, nativeEvent);

          this._layerCallbacks[hit.data.id](mouseoverEvent);
        }
      }
    }

    class MouseoutHandler extends MarkInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'mouseout',
          eventName: 'mousemove'
        });

        this._previousMouseoverHits = {};
        this._currentMouseoverHits = {};
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        const spatialIndex = this._spatialIndex;
        const hits = spatialIndex.queryMouseCoordinates(screenCoordinates);

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];
          const hitId = getHitId(hit);

          this._currentMouseoverHits[hitId] = hit;
        }

        for (const hitId in this._previousMouseoverHits) {
          if (!(hitId in this._currentMouseoverHits)) {
            const hit = this._previousMouseoverHits[hitId];
            this._fireCallback(hit, screenCoordinates, nativeEvent);
          }
        }

        this._previousMouseoverHits = this._currentMouseoverHits;
        this._currentMouseoverHits = {};
      }

      _fireCallback (hit, screenCoordinates, nativeEvent) {
        const localCoordinates = getLocalCoordinates(screenCoordinates, this.interactionManager());

        if (hitIsMark(hit)) {
          const mouseoutEvent = createMarkEvent('mouseout', {
            screenCoordinates,
            localCoordinates
          }, hit, nativeEvent);

          this._markCallbacks[hit.data.id](mouseoutEvent);
        }

        if (hitIsInLayer(hit)) {
          const mouseoutEvent = createLayerEvent('mouseout', {
            screenCoordinates,
            localCoordinates
          }, hit, nativeEvent);

          this._layerCallbacks[hit.data.id](mouseoutEvent);
        }
      }
    }

    class MousedownHandler extends MarkInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'mousedown',
          eventName: 'mousedown'
        });
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        if (!coordinatesAreInsideSection(screenCoordinates, this.section())) {
          return
        }

        const spatialIndex = this._spatialIndex;
        const hits = spatialIndex.queryMouseCoordinates(screenCoordinates);
        const localCoordinates = getLocalCoordinates(screenCoordinates, this.interactionManager());

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];

          if (hitIsMark(hit)) {
            const mousedownEvent = createMarkEvent('mousedown', {
              screenCoordinates,
              localCoordinates
            }, hit, nativeEvent);

            this._markCallbacks[hit.data.id](mousedownEvent);
          }

          if (hitIsInLayer(hit)) {
            const mousedownEvent = createLayerEvent('mousedown', {
              screenCoordinates,
              localCoordinates
            }, hit, nativeEvent);

            this._layerCallbacks[hit.data.id](mousedownEvent);
          }
        }
      }
    }

    class MouseupHandler extends MarkInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'mouseup',
          eventName: 'mouseup'
        });
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        if (!coordinatesAreInsideSection(screenCoordinates, this.section())) {
          return
        }

        const spatialIndex = this._spatialIndex;
        const hits = spatialIndex.queryMouseCoordinates(screenCoordinates);
        const localCoordinates = getLocalCoordinates(screenCoordinates, this.interactionManager());

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];

          if (hitIsMark(hit)) {
            const mouseupEvent = createMarkEvent('mouseup', {
              screenCoordinates,
              localCoordinates
            }, hit, nativeEvent);

            this._markCallbacks[hit.data.id](mouseupEvent);
          }

          if (hitIsInLayer(hit)) {
            const mouseupEvent = createLayerEvent('mouseup', {
              screenCoordinates,
              localCoordinates
            }, hit, nativeEvent);

            this._layerCallbacks[hit.data.id](mouseupEvent);
          }
        }
      }
    }

    class MousedragHandler extends MarkInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'mousedrag',
          eventName: ['mousedown', 'mousemove', 'mouseup']
        });

        this._currentHits = {};
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        if (nativeEvent.eventName === 'mousedown') {
          this._handleMousedown(screenCoordinates, nativeEvent);
        }

        if (nativeEvent.eventName === 'mousemove') {
          this._handleMousemove(screenCoordinates, nativeEvent);
        }

        if (nativeEvent.eventName === 'mouseup') {
          this._handleMouseup(screenCoordinates, nativeEvent);
        }
      }

      _handleMousedown (screenCoordinates, nativeEvent) {
        if (!coordinatesAreInsideSection(screenCoordinates, this.section())) {
          return
        }

        const spatialIndex = this._spatialIndex;
        const hits = spatialIndex.queryMouseCoordinates(screenCoordinates);

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];
          const hitId = getHitId(hit);

          this._currentHits[hitId] = hit;

          this._fireCallback(hit, screenCoordinates, nativeEvent, 'start');
        }
      }

      _handleMousemove (screenCoordinates, nativeEvent) {
        if (!coordinatesAreInsideSection(screenCoordinates, this.section())) {
          return
        }

        for (const hitId in this._currentHits) {
          const hit = this._currentHits[hitId];
          this._fireCallback(hit, screenCoordinates, nativeEvent, 'drag');
        }
      }

      _handleMouseup (screenCoordinates, nativeEvent) {
        for (const hitId in this._currentHits) {
          const hit = this._currentHits[hitId];
          this._fireCallback(hit, screenCoordinates, nativeEvent, 'end');
        }

        this._currentHits = {};
      }

      _fireCallback (hit, screenCoordinates, nativeEvent, dragType) {
        const localCoordinates = getLocalCoordinates(screenCoordinates, this.interactionManager());

        if (hitIsMark(hit)) {
          const mousedragEvent = createMarkEvent('mousedrag', {
            screenCoordinates,
            localCoordinates,
            dragType
          }, hit, nativeEvent);

          this._markCallbacks[hit.data.id](mousedragEvent);
        }

        if (hitIsInLayer(hit)) {
          const mousedragEvent = createLayerEvent('mousedrag', {
            screenCoordinates,
            localCoordinates,
            dragType
          }, hit, nativeEvent);

          this._layerCallbacks[hit.data.id](mousedragEvent);
        }
      }
    }

    var MarkInteractionHandlers = /*#__PURE__*/Object.freeze({
      __proto__: null,
      ClickHandler: ClickHandler,
      MouseoverHandler: MouseoverHandler,
      MouseoutHandler: MouseoutHandler,
      MousedownHandler: MousedownHandler,
      MouseupHandler: MouseupHandler,
      MousedragHandler: MousedragHandler
    });

    class SectionInteractionHandler extends BaseInteractionHandler {
      constructor (interactionManager, options) {
        super(interactionManager, options);
        this._callback = undefined;
      }

      addInteraction (callback) {
        this._addEventListener();
        this._callback = callback;
      }

      hasInteraction () {
        return this._callback !== undefined
      }

      removeInteraction () {
        if (this._callback) {
          this._callback = undefined;
          this._removeEventListener();
        }
      }

      getId () {
        return `${this.id()}-section-${this._interactionName}`
      }
    }

    // Taken from:
    // https://stackoverflow.com/a/37474225/7237112

    function getScrollLineHeight () {
      var r;
      var iframe = document.createElement('iframe');
      iframe.src = '#';
      document.body.appendChild(iframe);
      var iwin = iframe.contentWindow;
      var idoc = iwin.document;
      idoc.open();
      idoc.write('<!DOCTYPE html><html><head></head><body><span>a</span></body></html>');
      idoc.close();
      var span = idoc.body.firstElementChild;
      r = span.offsetHeight;
      document.body.removeChild(iframe);

      return r
    }

    class WheelHandler extends SectionInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'wheel',
          eventName: 'wheel'
        });
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        nativeEvent.preventDefault();
        nativeEvent.stopPropagation();

        const interactionManager = this.interactionManager();
        const section = this.section();

        if (coordinatesAreInsideSection(screenCoordinates, section)) {
          const localCoordinates = getLocalCoordinates(screenCoordinates, interactionManager);
          const delta = getDelta(nativeEvent);

          const wheelEvent = createSectionEvent('wheel', {
            screenCoordinates,
            localCoordinates,
            delta
          }, nativeEvent);

          this._callback(wheelEvent);
        }
      }
    }

    let scrollLineHeight;

    function getDelta (nativeEvent) {
      let delta;

      // Legacy
      // IE pixels
      if ('wheelDelta' in nativeEvent && nativeEvent.wheelDelta !== 0) {
        delta = -nativeEvent.wheelDelta;
      }

      // Mozilla
      if ('detail' in nativeEvent && nativeEvent.detail !== 0) {
        delta = -nativeEvent.detail;
      }

      // Most other cases
      if ('deltaY' in nativeEvent && nativeEvent.deltaY !== 0) {
        delta = -nativeEvent.deltaY;
      }

      if (!scrollLineHeight) {
        scrollLineHeight = getScrollLineHeight();
      }

      return delta * (nativeEvent.deltaMode ? scrollLineHeight : 1) / 500
    }

    class ClickHandler$1 extends SectionInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'click',
          eventName: 'click'
        });
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        const interactionManager = this.interactionManager();
        const section = this.section();

        if (coordinatesAreInsideSection(screenCoordinates, section)) {
          const localCoordinates = getLocalCoordinates(screenCoordinates, interactionManager);

          const clickEvent = createSectionEvent('click', {
            screenCoordinates,
            localCoordinates
          }, nativeEvent);

          this._callback(clickEvent);
        }
      }
    }

    class MousedownHandler$1 extends SectionInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'mousedown',
          eventName: 'mousedown'
        });
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        const interactionManager = this.interactionManager();
        const section = this.section();

        if (coordinatesAreInsideSection(screenCoordinates, section)) {
          const localCoordinates = getLocalCoordinates(screenCoordinates, interactionManager);

          const mousedownEvent = createSectionEvent('mousedown', {
            screenCoordinates,
            localCoordinates
          }, nativeEvent);

          this._callback(mousedownEvent);
        }
      }
    }

    class MouseupHandler$1 extends SectionInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'mouseup',
          eventName: 'mouseup'
        });
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        const interactionManager = this.interactionManager();
        const section = this.section();

        if (coordinatesAreInsideSection(screenCoordinates, section)) {
          const localCoordinates = getLocalCoordinates(screenCoordinates, interactionManager);

          const mouseupEvent = createSectionEvent('mouseup', {
            screenCoordinates,
            localCoordinates
          }, nativeEvent);

          this._callback(mouseupEvent);
        }
      }
    }

    class MouseoverHandler$1 extends SectionInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'mouseover',
          eventName: 'mousemove'
        });

        this._mouseCurrentlyOverSection = false;
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        const interactionManager = this.interactionManager();
        const section = this.section();

        if (coordinatesAreInsideSection(screenCoordinates, section)) {
          if (!this._mouseCurrentlyOverSection) {
            const localCoordinates = getLocalCoordinates(screenCoordinates, interactionManager);

            const mousedownEvent = createSectionEvent('mouseover', {
              screenCoordinates,
              localCoordinates
            }, nativeEvent);

            this._callback(mousedownEvent);
            this._mouseCurrentlyOverSection = true;
          }
        } else {
          if (this._mouseCurrentlyOverSection) {
            this._mouseCurrentlyOverSection = false;
          }
        }
      }
    }

    class MouseoutHandler$1 extends SectionInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'mouseout',
          eventName: 'mousemove'
        });

        this._mouseCurrentlyOverSection = false;
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        const interactionManager = this.interactionManager();
        const section = this.section();

        if (coordinatesAreInsideSection(screenCoordinates, section)) {
          if (!this._mouseCurrentlyOverSection) {
            this._mouseCurrentlyOverSection = true;
          }
        } else {
          if (this._mouseCurrentlyOverSection) {
            const localCoordinates = getLocalCoordinates(screenCoordinates, interactionManager);

            const mouseoutEvent = createSectionEvent('mouseout', {
              screenCoordinates,
              localCoordinates
            }, nativeEvent);

            this._callback(mouseoutEvent);
            this._mouseCurrentlyOverSection = false;
          }
        }
      }
    }

    class MousemoveHandler extends SectionInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'mouseover',
          eventName: 'mousemove'
        });
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        const interactionManager = this.interactionManager();
        const section = this.section();

        if (coordinatesAreInsideSection(screenCoordinates, section)) {
          const localCoordinates = getLocalCoordinates(screenCoordinates, interactionManager);

          const mousemoveEvent = createSectionEvent('mousemove', {
            screenCoordinates,
            localCoordinates
          }, nativeEvent);

          this._callback(mousemoveEvent);
        }
      }
    }

    var SectionInteractionHandlers = /*#__PURE__*/Object.freeze({
      __proto__: null,
      WheelHandler: WheelHandler,
      ClickHandler: ClickHandler$1,
      MousedownHandler: MousedownHandler$1,
      MouseupHandler: MouseupHandler$1,
      MouseoverHandler: MouseoverHandler$1,
      MouseoutHandler: MouseoutHandler$1,
      MousemoveHandler: MousemoveHandler
    });

    class MouseInteractionManager extends BaseInteractionManager {
      constructor () {
        super();

        this._markInteractionInterface = new MarkInteractionInterface(this, MarkInteractionHandlers);
        this._sectionInteractionInterface = new SectionInteractionInterface(this, SectionInteractionHandlers);
      }
    }

    function numberOfTouches (screenCoordinates) {
      if (screenCoordinates.constructor === Object) return 1

      return screenCoordinates.length
    }

    class TouchdownHandler extends MarkInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'touchdown',
          eventName: 'touchstart'
        });
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        if (numberOfTouches(screenCoordinates) !== 1) {
          return
        }

        const spatialIndex = this._spatialIndex;
        const hits = spatialIndex.queryMouseCoordinates(screenCoordinates);
        const localCoordinates = getLocalCoordinates(screenCoordinates, this.interactionManager());

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];

          if (hitIsMark(hit)) {
            const touchdownEvent = createMarkEvent('touchdown', {
              screenCoordinates,
              localCoordinates
            }, hit, nativeEvent);

            this._markCallbacks[hit.data.id](touchdownEvent);
          }

          if (hitIsInLayer(hit)) {
            const touchdownEvent = createLayerEvent('touchdown', {
              screenCoordinates,
              localCoordinates
            }, hit, nativeEvent);

            this._layerCallbacks[hit.data.id](touchdownEvent);
          }
        }
      }
    }

    class TouchupHandler extends MarkInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'touchup',
          eventName: ['touchend', 'touchcancel']
        });
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        if (numberOfTouches(screenCoordinates) !== 1) {
          return
        }

        const spatialIndex = this._spatialIndex;
        const hits = spatialIndex.queryMouseCoordinates(screenCoordinates);
        const localCoordinates = getLocalCoordinates(screenCoordinates, this.interactionManager());

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];

          if (hitIsMark(hit)) {
            const touchupEvent = createMarkEvent('touchup', {
              screenCoordinates,
              localCoordinates
            }, hit, nativeEvent);

            this._markCallbacks[hit.data.id](touchupEvent);
          }

          if (hitIsInLayer(hit)) {
            const touchupEvent = createLayerEvent('touchup', {
              screenCoordinates,
              localCoordinates
            }, hit, nativeEvent);

            this._layerCallbacks[hit.data.id](touchupEvent);
          }
        }
      }
    }

    class TouchoverHandler extends MarkInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'touchover',
          eventName: ['touchstart', 'touchmove']
        });

        this._previousHits = {};
        this._currentHits = {};
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        if (numberOfTouches(screenCoordinates) !== 1) {
          return
        }

        if (nativeEvent.eventName === 'touchstart') {
          this._handleTouchstart(screenCoordinates, nativeEvent);
        }

        if (nativeEvent.eventName === 'touchmove') {
          this._handleTouchmove(screenCoordinates, nativeEvent);
        }
      }

      _handleTouchstart (screenCoordinates, nativeEvent) {
        if (!coordinatesAreInsideSection(screenCoordinates, this.section())) {
          return
        }

        const spatialIndex = this._spatialIndex;
        const hits = spatialIndex.queryMouseCoordinates(screenCoordinates);

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];
          const hitId = getHitId(hit);

          this._previousHits[hitId] = true;
        }
      }

      _handleTouchmove (screenCoordinates, nativeEvent) {
        if (!coordinatesAreInsideSection(screenCoordinates, this.section())) {
          return
        }

        const spatialIndex = this._spatialIndex;
        const hits = spatialIndex.queryMouseCoordinates(screenCoordinates);

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];
          const hitId = getHitId(hit);

          this._currentHits[hitId] = true;

          if (!(hitId in this._previousHits)) {
            this._fireCallback(hit, screenCoordinates, nativeEvent);
          }
        }

        this._previousHits = this._currentHits;
        this._currentHits = {};
      }

      _fireCallback (hit, screenCoordinates, nativeEvent) {
        const localCoordinates = getLocalCoordinates(screenCoordinates, this.interactionManager());

        if (hitIsMark(hit)) {
          const touchoverEvent = createMarkEvent('touchover', {
            screenCoordinates,
            localCoordinates
          }, hit, nativeEvent);

          this._markCallbacks[hit.data.id](touchoverEvent);
        }

        if (hitIsInLayer(hit)) {
          const touchoverEvent = createLayerEvent('touchover', {
            screenCoordinates,
            localCoordinates
          }, hit, nativeEvent);

          this._layerCallbacks[hit.data.id](touchoverEvent);
        }
      }
    }

    class TouchoutHandler extends MarkInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'touchout',
          eventName: ['touchstart', 'touchmove', 'touchend']
        });

        this._previousHits = {};
        this._currentHits = {};
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        if (numberOfTouches(screenCoordinates) !== 1) {
          return
        }

        if (nativeEvent.eventName === 'touchstart') {
          this._handleTouchstart(screenCoordinates, nativeEvent);
        }

        if (nativeEvent.eventName === 'touchmove') {
          this._handleTouchmove(screenCoordinates, nativeEvent);
        }

        if (nativeEvent.eventName === 'touchend') {
          this._handleTouchend();
        }
      }

      _handleTouchstart (screenCoordinates, nativeEvent) {
        if (!coordinatesAreInsideSection(screenCoordinates, this.section())) {
          return
        }

        const spatialIndex = this._spatialIndex;
        const hits = spatialIndex.queryMouseCoordinates(screenCoordinates);

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];
          const hitId = getHitId(hit);

          this._previousHits[hitId] = hit;
        }
      }

      _handleTouchmove (screenCoordinates, nativeEvent) {
        if (!coordinatesAreInsideSection(screenCoordinates, this.section())) {
          return
        }

        const spatialIndex = this._spatialIndex;
        const hits = spatialIndex.queryMouseCoordinates(screenCoordinates);

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];
          const hitId = getHitId(hit);

          this._currentHits[hitId] = hit;
        }

        for (const hitId in this._previousHits) {
          if (!(hitId in this._currentHits)) {
            const hit = this._previousHits[hitId];
            this._fireCallback(hit, screenCoordinates, nativeEvent);
          }
        }

        this._previousHits = this._currentHits;
        this._currentHits = {};
      }

      _handleTouchend () {
        this._previousHits = {};
        this._currentHits = {};
      }

      _fireCallback (hit, screenCoordinates, nativeEvent) {
        const localCoordinates = getLocalCoordinates(screenCoordinates, this.interactionManager());

        if (hitIsMark(hit)) {
          const touchoutEvent = createMarkEvent('touchout', {
            screenCoordinates,
            localCoordinates
          }, hit, nativeEvent);

          this._markCallbacks[hit.data.id](touchoutEvent);
        }

        if (hitIsInLayer(hit)) {
          const touchoutEvent = createLayerEvent('touchout', {
            screenCoordinates,
            localCoordinates
          }, hit, nativeEvent);

          this._layerCallbacks[hit.data.id](touchoutEvent);
        }
      }
    }

    class TouchdragHandler extends MarkInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'touchdrag',
          eventName: ['touchstart', 'touchmove', 'touchend']
        });

        this._currentHits = {};
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        if (numberOfTouches(screenCoordinates) !== 1) {
          return
        }

        if (nativeEvent.eventName === 'touchstart') {
          this._handleTouchstart(screenCoordinates, nativeEvent);
        }

        if (nativeEvent.eventName === 'touchmove') {
          this._handleTouchmove(screenCoordinates, nativeEvent);
        }

        if (nativeEvent.eventName === 'touchend') {
          this._handleTouchend(screenCoordinates, nativeEvent);
        }
      }

      _handleTouchstart (screenCoordinates, nativeEvent) {
        if (!coordinatesAreInsideSection(screenCoordinates, this.section())) {
          return
        }

        const spatialIndex = this._spatialIndex;
        const hits = spatialIndex.queryMouseCoordinates(screenCoordinates);

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];
          const hitId = getHitId(hit);

          this._currentHits[hitId] = hit;

          this._fireCallback(hit, screenCoordinates, nativeEvent, 'start');
        }
      }

      _handleTouchmove (screenCoordinates, nativeEvent) {
        if (!coordinatesAreInsideSection(screenCoordinates, this.section())) {
          return
        }

        for (const hitId in this._currentHits) {
          const hit = this._currentHits[hitId];
          this._fireCallback(hit, screenCoordinates, nativeEvent, 'drag');
        }
      }

      _handleTouchend (screenCoordinates, nativeEvent) {
        for (const hitId in this._currentHits) {
          const hit = this._currentHits[hitId];
          this._fireCallback(hit, screenCoordinates, nativeEvent, 'end');
        }

        this._currentHits = {};
      }

      _fireCallback (hit, screenCoordinates, nativeEvent, dragType) {
        const localCoordinates = getLocalCoordinates(screenCoordinates, this.interactionManager());

        if (hitIsMark(hit)) {
          const touchdragEvent = createMarkEvent('touchdrag', {
            screenCoordinates,
            localCoordinates,
            dragType
          }, hit, nativeEvent);

          this._markCallbacks[hit.data.id](touchdragEvent);
        }

        if (hitIsInLayer(hit)) {
          const touchdragEvent = createLayerEvent('touchdrag', {
            screenCoordinates,
            localCoordinates,
            dragType
          }, hit, nativeEvent);

          this._layerCallbacks[hit.data.id](touchdragEvent);
        }
      }
    }

    var MarkInteractionHandlers$1 = /*#__PURE__*/Object.freeze({
      __proto__: null,
      TouchdownHandler: TouchdownHandler,
      TouchupHandler: TouchupHandler,
      TouchoverHandler: TouchoverHandler,
      TouchoutHandler: TouchoutHandler,
      TouchdragHandler: TouchdragHandler
    });

    class TouchdownHandler$1 extends SectionInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'touchdown',
          eventName: 'touchstart'
        });
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        if (numberOfTouches(screenCoordinates) !== 1) {
          return
        }

        const interactionManager = this.interactionManager();
        const section = this.section();

        if (coordinatesAreInsideSection(screenCoordinates, section)) {
          const localCoordinates = getLocalCoordinates(screenCoordinates, interactionManager);

          const touchdownEvent = createSectionEvent('touchdown', {
            screenCoordinates,
            localCoordinates
          }, nativeEvent);

          this._callback(touchdownEvent);
        }
      }
    }

    class TouchmoveHandler extends SectionInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'touchmove',
          eventName: 'touchmove'
        });
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        if (numberOfTouches(screenCoordinates) !== 1) {
          return
        }

        const interactionManager = this.interactionManager();
        const section = this.section();

        if (coordinatesAreInsideSection(screenCoordinates, section)) {
          const localCoordinates = getLocalCoordinates(screenCoordinates, interactionManager);

          const touchmoveEvent = createSectionEvent('touchmove', {
            screenCoordinates,
            localCoordinates
          }, nativeEvent);

          this._callback(touchmoveEvent);
        }
      }
    }

    class TouchupHandler$1 extends SectionInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'touchup',
          eventName: ['touchend', 'touchcancel']
        });
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        if (numberOfTouches(screenCoordinates) !== 1) {
          return
        }

        const interactionManager = this.interactionManager();
        const section = this.section();

        if (coordinatesAreInsideSection(screenCoordinates, section)) {
          const localCoordinates = getLocalCoordinates(screenCoordinates, interactionManager);

          const touchupEvent = createSectionEvent('touchup', {
            screenCoordinates,
            localCoordinates
          }, nativeEvent);

          this._callback(touchupEvent);
        }
      }
    }

    class TouchoverHandler$1 extends SectionInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'touchover',
          eventName: ['touchstart', 'touchmove']
        });

        this._fingerCurrentlyOverSection = false;
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        if (numberOfTouches(screenCoordinates) !== 1) {
          return
        }

        if (nativeEvent.eventName === 'touchstart') {
          this._handleTouchstart(screenCoordinates, nativeEvent);
        }

        if (nativeEvent.eventName === 'touchmove') {
          this._handleTouchmove(screenCoordinates, nativeEvent);
        }
      }

      _handleTouchstart (screenCoordinates, nativeEvent) {
        const section = this.section();

        if (coordinatesAreInsideSection(screenCoordinates, section)) {
          this._fingerCurrentlyOverSection = true;
        }
      }

      _handleTouchmove (screenCoordinates, nativeEvent) {
        const interactionManager = this.interactionManager();
        const section = this.section();

        if (coordinatesAreInsideSection(screenCoordinates, section)) {
          if (!this._fingerCurrentlyOverSection) {
            const localCoordinates = getLocalCoordinates(screenCoordinates, interactionManager);

            const touchoverEvent = createSectionEvent('touchover', {
              screenCoordinates,
              localCoordinates
            }, nativeEvent);

            this._callback(touchoverEvent);
            this._fingerCurrentlyOverSection = true;
          }
        } else {
          if (this._fingerCurrentlyOverSection) {
            this._fingerCurrentlyOverSection = false;
          }
        }
      }
    }

    class TouchoutHandler$1 extends SectionInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'touchout',
          eventName: ['touchstart', 'touchmove', 'touchend']
        });

        this._fingerCurrentlyOverSection = false;
      }

      _handleEvent (screenCoordinates, nativeEvent) {
        if (numberOfTouches(screenCoordinates) !== 1) {
          return
        }

        if (nativeEvent.eventName === 'touchstart') {
          this._handleTouchstart(screenCoordinates, nativeEvent);
        }

        if (nativeEvent.eventName === 'touchmove') {
          this._handleTouchmove(screenCoordinates, nativeEvent);
        }

        if (nativeEvent.eventName === 'touchend') {
          this._handleTouchend();
        }
      }

      _handleTouchstart (screenCoordinates, nativeEvent) {
        const section = this.section();

        if (coordinatesAreInsideSection(screenCoordinates, section)) {
          this._fingerCurrentlyOverSection = true;
        }
      }

      _handleTouchmove (screenCoordinates, nativeEvent) {
        const interactionManager = this.interactionManager();
        const section = this.section();

        if (coordinatesAreInsideSection(screenCoordinates, section)) {
          if (!this._fingerCurrentlyOverSection) {
            this._fingerCurrentlyOverSection = true;
          }
        } else {
          if (this._fingerCurrentlyOverSection) {
            const localCoordinates = getLocalCoordinates(screenCoordinates, interactionManager);

            const touchoutEvent = createSectionEvent('touchout', {
              screenCoordinates,
              localCoordinates
            }, nativeEvent);

            this._callback(touchoutEvent);
            this._fingerCurrentlyOverSection = false;
          }
        }
      }

      _handleTouchend () {
        this._fingerCurrentlyOverSection = false;
      }
    }

    class PinchHandler extends SectionInteractionHandler {
      constructor (interactionManager) {
        super(interactionManager, {
          interactionName: 'pinch',
          eventName: ['touchstart', 'touchmove', 'touchend']
        });

        this._previousTouchDistance = undefined;
      }

      _handleEvent (screenCoordinatesArray, nativeEvent) {
        if (nativeEvent.type === 'touchstart') {
          this._handleTouchstart(screenCoordinatesArray, nativeEvent);
        }

        if (nativeEvent.type === 'touchmove') {
          this._handleTouchmove(screenCoordinatesArray, nativeEvent);
        }

        if (nativeEvent.type === 'touchend') {
          this._handleTouchend(screenCoordinatesArray, nativeEvent);
        }
      }

      _handleTouchstart (screenCoordinatesArray, nativeEvent) {
        if (numberOfTouches(screenCoordinatesArray) !== 2) {
          return
        }

        const section = this.section();

        if (allCoordinatesAreInsideSection(screenCoordinatesArray, section)) {
          this._previousTouchDistance = getDistance(screenCoordinatesArray);
        }
      }

      _handleTouchmove (screenCoordinatesArray, nativeEvent) {
        if (numberOfTouches(screenCoordinatesArray) !== 2) {
          return
        }

        if (this._previousTouchDistance === undefined) return

        const section = this.section();

        if (allCoordinatesAreInsideSection(screenCoordinatesArray, section)) {
          const sectionHeight = section.maxY - section.minY;

          const center = getCenter(screenCoordinatesArray);

          const touchDistance = getDistance(screenCoordinatesArray);
          const touchDelta = this._previousTouchDistance - touchDistance;
          const relativeTouchDelta = touchDelta / sectionHeight;

          this._previousTouchDistance = touchDistance;
          this._fireCallback(screenCoordinatesArray, nativeEvent, relativeTouchDelta, center);
        }
      }

      _handleTouchend (screenCoordinatesArray, nativeEvent) {
        this._previousTouchDistance = undefined;
      }

      _fireCallback (screenCoordinatesArray, nativeEvent, delta, center) {
        const screenCenter = center;
        const localCenter = getLocalCoordinates(screenCenter, this.interactionManager());
        const screenCoordinates = screenCoordinatesArray;
        const localCoordinates = screenCoordinatesArray.map(screenCoordinates => {
          return getLocalCoordinates(screenCoordinates, this.interactionManager())
        });

        const pinchEvent = createSectionEvent('pinch', {
          screenCenter,
          localCenter,
          screenCoordinates,
          localCoordinates,
          delta
        }, nativeEvent);

        this._callback(pinchEvent);
      }
    }

    function allCoordinatesAreInsideSection (screenCoordinatesArray, section) {
      return screenCoordinatesArray.every(screenCoordinates => {
        return coordinatesAreInsideSection(screenCoordinates, section)
      })
    }

    function getDistance (screenCoordinatesArray) {
      const [coords1, coords2] = screenCoordinatesArray;
      return Math.sqrt((coords2.x - coords1.x) ** 2 + (coords2.y - coords1.y) ** 2)
    }

    function getCenter (screenCoordinatesArray) {
      const [coords1, coords2] = screenCoordinatesArray;
      return { x: (coords2.x + coords1.x) / 2, y: (coords2.y + coords1.y) / 2 }
    }

    var SectionInteractionHandlers$1 = /*#__PURE__*/Object.freeze({
      __proto__: null,
      TouchdownHandler: TouchdownHandler$1,
      TouchmoveHandler: TouchmoveHandler,
      TouchupHandler: TouchupHandler$1,
      TouchoverHandler: TouchoverHandler$1,
      TouchoutHandler: TouchoutHandler$1,
      PinchHandler: PinchHandler
    });

    class TouchInteractionManager extends BaseInteractionManager {
      constructor () {
        super();

        this._markInteractionInterface = new MarkInteractionInterface(this, MarkInteractionHandlers$1);
        this._sectionInteractionInterface = new SectionInteractionInterface(this, SectionInteractionHandlers$1);
      }
    }

    function centroidPoint (mark) {
      return _centroidPoint(mark.positioning)
    }

    function _centroidPoint (positioning) {
      for (let i = 0; i < positioning.call.length; i++) {
        if (positioning.call[i] === 'arc') {
          return [positioning.args[i][0], positioning.args[i][1]]
        }
      }
    }

    function centroidPointLayer (layer) {
      const centroids = [];

      for (let i = 0; i < layer.positioning.length; i++) {
        centroids.push(_centroidPoint(layer.positioning[i]));
      }

      return centroids
    }

    function createBboxFromCentroid ([x, y], index) {
      return {
        minX: x,
        maxX: x,
        minY: y,
        maxY: y,
        index
      }
    }

    function indexPoint$1 (mark) {
      const centroid = centroidPoint(mark);
      const bbox = createBboxFromCentroid(centroid);

      Object.assign(bbox, { data: mark });

      return [bbox]
    }

    function indexPointLayer$1 (layer) {
      const centroids = centroidPointLayer(layer);
      const bboxes = centroids.map(createBboxFromCentroid);

      layer.props.keys
        ? attachWithKeys(bboxes, { data: layer }, layer.props.keys)
        : attach(bboxes, { data: layer });

      return bboxes
    }

    function interpolateQuadratic (x0, y0, x1, y1, x2, y2) {
      const points = [];

      for (let i = 1; i <= 5; i++) {
        const x = evalQuadratic(x0, x1, x2, i * 0.2);
        const y = evalQuadratic(y0, y1, y2, i * 0.2);

        points.push([x, y]);
      }

      return points
    }

    function interpolateCubic (x0, y0, x1, y1, x2, y2, x3, y3) {
      const points = [];

      for (let i = 1; i <= 10; i++) {
        const x = evalCubic(x0, x1, x2, x3, i * 0.2);
        const y = evalCubic(y0, y1, y2, y3, i * 0.2);

        points.push([x, y]);
      }

      return points
    }

    function interpolateEllipse (x, y, rx, ry, rot, a0, a1, ccw) {
      const points = [];

      if (a0 < a1) {
        const da = a1 - a0;
        const dai = da / 8;

        if (!ccw) {
          for (let i = 1; i <= 8; i++) {
            points.push([
              Math.cos(a0 + dai * i) * rx + x,
              Math.sin(a0 + dai * i) * ry + y
            ]);
          }
        }

        if (ccw) {
          for (let i = 7; i >= 0; i--) {
            points.push([
              Math.cos(a0 + dai * i) * rx + x,
              Math.sin(a0 + dai * i) * ry + y
            ]);
          }
        }
      }

      if (a0 > a1) {
        const da0 = TWO_PI$1 - a1;
        const da0i = da0 / 8;

        const da1i = a0 / 8;

        if (!ccw) {
          for (let i = 1; i <= 8; i++) {
            points.push([
              Math.cos(a1 + da0i * i) * rx + x,
              Math.sin(a1 + da0i * i) * ry + y
            ]);
          }

          for (let i = 1; i <= 8; i++) {
            points.push([
              Math.cos(da1i * i) * rx + x,
              Math.sin(da1i * i) * ry + y
            ]);
          }
        }

        if (ccw) {
          for (let i = 7; i >= 0; i--) {
            points.push([
              Math.cos(da1i * i) * rx + x,
              Math.sin(da1i * i) * ry + y
            ]);
          }

          for (let i = 7; i >= 0; i--) {
            points.push([
              Math.cos(a1 + da0i * i) * rx + x,
              Math.sin(a1 + da0i * i) * ry + y
            ]);
          }
        }
      }

      return points
    }

    const TWO_PI$1 = Math.PI * 2;

    /* eslint-disable no-case-declarations */

    function centroidPolygon (mark) {
      return _centroidPolygon(mark.positioning)
    }

    function _centroidPolygon (positioning) {
      const linearRings = toLinearRings(positioning);
      const centroidsAndAreas = linearRings.map(calculateLinearRingCentroidAndArea);

      return getMeanCentroidWeightedByArea(centroidsAndAreas)
    }

    function centroidPolygonLayer (layer) {
      return layer.positioning.map(_centroidPolygon)
    }

    function toLinearRings (positioning) {
      const linearRings = [];

      const submarks = positioning.submarks.length
        ? positioning.submarks
        : [0];

      for (let i = 0; i < submarks.length; i++) {
        const submarkStart = submarks[i];
        const submarkEnd = submarks[i + 1] || positioning.call.length;

        linearRings.push(toLinearRing(positioning, submarkStart, submarkEnd));
      }

      return linearRings
    }

    function toLinearRing (positioning, start, end) {
      let linearRing = [];

      let lastX;
      let lastY;

      let numberOfMoveTos = 0;

      for (let i = start; i < end; i++) {
        const call = positioning.call[i];
        const args = positioning.args[i];

        switch (call) {
          case 'moveTo':
            // This ignores holes
            numberOfMoveTos++;

            if (numberOfMoveTos === 2) {
              return linearRing
            }

            lastX = args[0];
            lastY = args[1];

            linearRing.push([lastX, lastY]);
            break
          case 'lineTo':
            lastX = args[0];
            lastY = args[1];

            linearRing.push([lastX, lastY]);
            break
          case 'quadraticCurveTo':
            linearRing = linearRing.concat(interpolateQuadratic(lastX, lastY, ...args));

            lastX = args[2];
            lastY = args[3];

            break
          case 'bezierCurveTo':
            linearRing = linearRing.concat(interpolateCubic(lastX, lastY, ...args));

            lastX = args[4];
            lastY = args[5];

            break
          case 'ellipse':
            linearRing = linearRing.concat(interpolateEllipse.apply(null, args));

            const endCoords = getEllipseEndCoords.apply(null, args);
            lastX = endCoords[0];
            lastY = endCoords[1];

            break
          case 'closePath':
            linearRing.push(linearRing[0]);

            break
        }
      }

      return linearRing
    }

    // https://stackoverflow.com/a/33852627/7237112
    function calculateLinearRingCentroidAndArea (ring) {
      const last = ring.length - 1;
      if (ring[0][0] !== ring[last][0] || ring[0][1] !== ring[last][1]) {
        ring.push(ring[0]);
      }

      const nPts = ring.length;
      const off = ring[0];
      let twicearea = 0;
      let x = 0;
      let y = 0;
      let p1;
      let p2;
      let f;

      for (let i = 0, j = nPts - 1; i < nPts; j = i++) {
        p1 = ring[i];
        p2 = ring[j];
        f = (p1[0] - off[0]) * (p2[1] - off[1]) - (p2[0] - off[0]) * (p1[1] - off[1]);
        twicearea += f;
        x += (p1[0] + p2[0] - 2 * off[0]) * f;
        y += (p1[1] + p2[1] - 2 * off[1]) * f;
      }

      f = twicearea * 3;

      return {
        centroid: [x / f + off[0], y / f + off[1]],
        area: Math.abs(twicearea / 2)
      }
    }

    function getMeanCentroidWeightedByArea (centroidsAndAreas) {
      if (centroidsAndAreas.length === 1) return centroidsAndAreas[0].centroid

      let x = 0;
      let y = 0;
      let totalArea = 0;

      for (let i = 0; i < centroidsAndAreas.length; i++) {
        const { centroid, area } = centroidsAndAreas[i];

        x += centroid[0] * area;
        y += centroid[1] * area;
        totalArea += area;
      }

      return [x / totalArea, y / totalArea]
    }

    function indexRectangle$1 (mark) {
      const centroid = centroidPolygon(mark);
      const bbox = createBboxFromCentroid(centroid);

      Object.assign(bbox, { data: mark });

      return [bbox]
    }

    function indexRectangleLayer$1 (layer) {
      const centroids = centroidPolygonLayer(layer);
      const bboxes = centroids.map(createBboxFromCentroid);

      layer.props.keys
        ? attachWithKeys(bboxes, { data: layer }, layer.props.keys)
        : attach(bboxes, { data: layer });

      return bboxes
    }

    function indexPolygon$1 (mark) {
      const centroid = centroidPolygon(mark);
      const bbox = createBboxFromCentroid(centroid);

      Object.assign(bbox, { data: mark });

      return [bbox]
    }

    function indexPolygonLayer$1 (layer) {
      const centroids = centroidPolygonLayer(layer);
      const bboxes = centroids.map(createBboxFromCentroid);

      layer.props.keys
        ? attachWithKeys(bboxes, { data: layer }, layer.props.keys)
        : attach(bboxes, { data: layer });

      return bboxes
    }

    function indexLine$1 (mark) {
      const centroid = centroidPolygon(mark);
      const bbox = createBboxFromCentroid(centroid);

      Object.assign(bbox, { data: mark });

      return [bbox]
    }

    function indexLineLayer$1 (layer) {
      const centroids = centroidPolygonLayer(layer);
      const bboxes = centroids.map(createBboxFromCentroid);

      layer.props.keys
        ? attachWithKeys(bboxes, { data: layer }, layer.props.keys)
        : attach(bboxes, { data: layer });

      return bboxes
    }

    function indexArea$1 (mark) {
      const centroid = centroidPolygon(mark);
      const bbox = createBboxFromCentroid(centroid);

      Object.assign(bbox, { data: mark });

      return [bbox]
    }

    function indexAreaLayer$1 (layer) {
      const centroids = centroidPolygonLayer(layer);
      const bboxes = centroids.map(createBboxFromCentroid);

      layer.props.keys
        ? attachWithKeys(bboxes, { data: layer }, layer.props.keys)
        : attach(bboxes, { data: layer });

      return bboxes
    }

    function centroidLabel (label) {
      const bbox = bboxLabel(label);
      return calculateLinearRingCentroidAndArea(bbox[0].rotatedBbox).centroid
    }

    function centroidLabelLayer (labelLayer) {
      const bboxes = bboxLabelLayer(labelLayer);
      return bboxes.map(b => calculateLinearRingCentroidAndArea(b.rotatedBbox).centroid)
    }

    function indexLabel$1 (mark) {
      const centroid = centroidLabel(mark);
      const bbox = createBboxFromCentroid(centroid);

      Object.assign(bbox, { data: mark });

      return [bbox]
    }

    function indexLabelLayer$1 (layer) {
      const centroids = centroidLabelLayer(layer);
      const bboxes = centroids.map(createBboxFromCentroid);

      layer.props.keys
        ? attachWithKeys(bboxes, { data: layer }, layer.props.keys)
        : attach(bboxes, { data: layer });

      return bboxes
    }

    const markIndexing$1 = {
      Point: indexPoint$1,
      Rectangle: indexRectangle$1,
      Polygon: indexPolygon$1,
      Line: indexLine$1,
      Label: indexLabel$1,
      Area: indexArea$1,
      Symbol: indexPolygon$1,
      FuncLine: indexLine$1
    };

    const layerIndexing$1 = {
      Point: indexPointLayer$1,
      Rectangle: indexRectangleLayer$1,
      Polygon: indexPolygonLayer$1,
      Line: indexLineLayer$1,
      Label: indexLabelLayer$1,
      Area: indexAreaLayer$1,
      Symbol: indexPolygon$1
    };

    class SelectManager {
      constructor () {
        this._selectableMarks = {};
        this._selectableLayers = {};

        this._markCallbacks = {};
        this._layerCallbacks = {};

        this._previousSelection = {};
        this._currentSelection = {};

        const getMark = function (markId) {
          return this._selectableMarks[markId]
        };

        const getLayer = function (layerId) {
          return this._selectableLayers[layerId]
        };

        this._spatialIndex = new SpatialIndex(this, getMark, getLayer);

        this._selectPolygon = { start: undefined, points: [] };
      }

      // Loading/indexing
      loadMark (mark, callbacks) {
        const indexingFunction = markIndexing$1[mark.type];
        const indexableMark = indexingFunction(mark);

        const markId = mark.id;

        this._selectableMarks[markId] = indexableMark;
        this._markCallbacks[markId] = callbacks;

        this._spatialIndex.indexMark(markId);
      }

      markIsLoaded ({ id }) {
        return id in this._selectableMarks
      }

      removeMark ({ id }) {
        this._spatialIndex.unindexMark(id);

        delete this._selectableMarks[id];
        delete this._markCallbacks[id];
      }

      loadLayer (layer, callbacks) {
        const indexingFunction = layerIndexing$1[layer.type];
        const indexableLayer = indexingFunction(layer);

        const layerId = layer.id;

        this._selectableLayers[layerId] = indexableLayer;
        this._layerCallbacks[layerId] = callbacks;

        this._spatialIndex.indexLayer(layerId);
      }

      layerIsLoaded ({ id }) {
        return id in this._selectableLayers
      }

      removeLayer ({ id }) {
        this._spatialIndex.unindexLayer(id);

        delete this._selectableLayers[id];
        delete this._layerCallbacks[id];
      }

      // Rectangle
      selectRectangle (rectangle) {
        const hits = this._spatialIndex.queryBoundingBox(rectangleToRBushBbox(rectangle));

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];
          const hitId = getHitId(hit);

          this._currentSelection[hitId] = hit;

          this._fireSelectCallback(hit);
        }
      }

      updateSelectRectangle (rectangle) {
        this._previousSelection = this._currentSelection;
        this._currentSelection = {};

        const hits = this._spatialIndex.queryBoundingBox(rectangleToRBushBbox(rectangle));

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];
          const hitId = getHitId(hit);

          this._currentSelection[hitId] = hit;

          if (!(hitId in this._previousSelection)) {
            this._fireSelectCallback(hit);
          }
        }

        for (const hitId in this._previousSelection) {
          if (!(hitId in this._currentSelection)) {
            const hit = this._previousSelection[hitId];

            this._fireDeselectCallback(hit);
          }
        }
      }

      resetSelectRectangle () {
        for (const hitId in this._currentSelection) {
          const hit = this._currentSelection[hitId];

          this._fireDeselectCallback(hit);
        }

        this._previousSelection = {};
        this._currentSelection = {};
      }

      // Polygon
      startSelectPolygon (startCoordinates) {
        this._selectPolygon.start = parseCoordinates(startCoordinates);
      }

      addPointToSelectPolygon (coordinates) {
        this._selectPolygon.points.push(parseCoordinates(coordinates));

        if (this._selectPolygon.points.length > 1) {
          const lastThreePointsPolygon = this._getLastThreePointsPolygon();
          const bbox = calculateBbox(lastThreePointsPolygon);

          const hits = this._spatialIndex.queryBoundingBox(bbox);

          for (let i = 0; i < hits.length; i++) {
            const hit = hits[i];
            const hitCentroid = [hit.minX, hit.minY];

            if (pointInPolygon(hitCentroid, lastThreePointsPolygon)) {
              const hitId = getHitId(hit);

              if (hitId in this._currentSelection) {
                this._fireDeselectCallback(hit);
                delete this._currentSelection[hitId];
              } else {
                this._fireSelectCallback(hit);
                this._currentSelection[hitId] = hit;
              }
            }
          }
        }
      }

      moveSelectPolygon (_delta) {
        this._previousSelection = this._currentSelection;
        this._currentSelection = {};

        const delta = parseCoordinates(_delta);

        const start = this._selectPolygon.start;
        const points = this._selectPolygon.points;

        this._selectPolygon.start = [start[0] + delta[0], start[1] + delta[1]];
        this._selectPolygon.points = points.map(point => [point[0] + delta[0], point[1] + delta[1]]);

        const polygon = this.getSelectPolygon();
        const bbox = calculateBbox(polygon.coordinates[0]);

        const hits = this._spatialIndex.queryBoundingBox(bbox);

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];
          const hitCentroid = [hit.minX, hit.minY];

          if (pointInPolygon(hitCentroid, polygon.coordinates[0])) {
            const hitId = getHitId(hit);

            this._currentSelection[hitId] = hit;

            if (!(hitId in this._previousSelection)) {
              this._fireSelectCallback(hit);
            }
          }
        }

        for (const hitId in this._previousSelection) {
          if (!(hitId in this._currentSelection)) {
            const hit = this._previousSelection[hitId];

            this._fireDeselectCallback(hit);
          }
        }
      }

      getSelectPolygon () {
        if (this._selectPolygon.start) {
          return {
            type: 'Polygon',
            coordinates: [[
              this._selectPolygon.start,
              ...this._selectPolygon.points,
              this._selectPolygon.start
            ]]
          }
        }
      }

      resetSelectPolygon () {
        for (const hitId in this._currentSelection) {
          const hit = this._currentSelection[hitId];

          this._fireDeselectCallback(hit);
        }

        this._selectPolygon = { start: undefined, points: [] };
        this._currentSelection = {};
      }

      _fireSelectCallback (hit) {
        if (hitIsMark(hit)) {
          const selectEvent = createSelectMarkEvent('select', hit);
          const callback = this._markCallbacks[hit.data.id].onSelect;

          if (callback) callback(selectEvent);
        }

        if (hitIsInLayer(hit)) {
          const selectEvent = createSelectLayerEvent('select', hit);
          const callback = this._layerCallbacks[hit.data.id].onSelect;

          if (callback) callback(selectEvent);
        }
      }

      _fireDeselectCallback (hit) {
        if (hitIsMark(hit)) {
          const deselectEvent = createSelectMarkEvent('deselect', hit);
          const callback = this._markCallbacks[hit.data.id].onDeselect;

          if (callback) callback(deselectEvent);
        }

        if (hitIsInLayer(hit)) {
          const deselectEvent = createSelectLayerEvent('deselect', hit);
          const callback = this._layerCallbacks[hit.data.id].onDeselect;

          if (callback) callback(deselectEvent);
        }
      }

      _getLastThreePointsPolygon () {
        const points = this._selectPolygon.points;
        const lastPointIndex = points.length - 1;
        const start = this._selectPolygon.start;

        return [start, points[lastPointIndex - 1], points[lastPointIndex], start]
      }
    }

    function rectangleToRBushBbox (rectangle) {
      return {
        minX: Math.min(rectangle.x1, rectangle.x2),
        maxX: Math.max(rectangle.x1, rectangle.x2),
        minY: Math.min(rectangle.y1, rectangle.y2),
        maxY: Math.max(rectangle.y1, rectangle.y2)
      }
    }

    function parseCoordinates (coordinates) {
      if (is2dArray(coordinates)) return coordinates
      if (isXYObject(coordinates)) return [coordinates.x, coordinates.y]

      throw new Error(`Invalid input: ${coordinates}`)
    }

    function is2dArray (coordinates) {
      return coordinates.constructor === Array &&
        coordinates.length === 2 &&
        coordinates.every(c => c && c.constructor === Number)
    }

    function isXYObject (coordinates) {
      return 'x' in coordinates && 'y' in coordinates &&
        coordinates.x.constructor === Number &&
        coordinates.y.constructor === Number
    }

    function calculateBbox (coords) {
      const bbox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };

      for (let i = 0; i < coords.length; i++) {
        const [x, y] = coords[i];
        updateBbox(bbox, x, y);
      }

      return bbox
    }

    class InteractionManager {
      constructor () {
        if (primaryInput === 'mouse') {
          this._mouseInteractionManager = new MouseInteractionManager();
        }

        if (primaryInput === 'touch') {
          this._touchInteractionManager = new TouchInteractionManager();
        }

        this._selectManager = new SelectManager();
      }

      // Initialization
      setId (id) {
        this._forEachManager(manager => { manager.setId(id); });
      }

      linkEventManager (eventManager) {
        if (this._mouseInteractionManager) {
          this._mouseInteractionManager.linkEventManager(eventManager.mouse());
        }

        if (this._touchInteractionManager) {
          this._touchInteractionManager.linkEventManager(eventManager.touch());
        }
      }

      // Section context loading
      loadSection (sectionContext) {
        this._forEachManager(manager => { manager.loadSection(sectionContext); });
      }

      // Access sub managers
      mouse () {
        return this._mouseInteractionManager
      }

      touch () {
        return this._touchInteractionManager
      }

      select () {
        return this._selectManager
      }

      // Other
      getPrimaryInput () {
        return primaryInput
      }

      // Internal
      _forEachManager (callback) {
        if (this._mouseInteractionManager) callback(this._mouseInteractionManager);
        if (this._touchInteractionManager) callback(this._touchInteractionManager);
      }
    }
    function streamLine (g, stream) {
      _streamLine(g.x, g.y, stream);
    }
    function streamPoint (g, stream) {
      stream.point(g.x, g.y);
    }
    function streamRectangle (g, stream) {
      _streamRectangle(g.x1, g.x2, g.y1, g.y2, stream);
    }
    function streamLineLayer (g, stream) {
      forEachIndex(g.x.length, i => {
        _streamLine(g.x[i], g.y[i], stream);
        stream.markEnd();
      });
    }
    function streamPointLayer (g, stream) {
      forEachIndex(g.x.length, i => {
        stream.point(g.x[i], g.y[i]);
        stream.markEnd();
      });
    }

    function _streamLine (x, y, stream, closed = 0) {
      stream.lineStart();
      streamXYArrays(x, y, stream, closed);
      stream.lineEnd();
    }

    function _streamRectangle (x1, x2, y1, y2, stream) {
      stream.polygonStart();
      stream.lineStart();

      stream.point(x1, y1);
      stream.point(x2, y1);
      stream.point(x2, y2);
      stream.point(x1, y2);

      stream.lineEnd();
      stream.polygonEnd();
    }

    function streamXYArrays (x, y, stream, closed = 0) {
      let i = -1;
      const n = x.length - closed;
      while (++i < n) stream.point(x[i], y[i]);
    }

    function forEachIndex (length, fn) {
      for (let i = 0; i < length; i++) fn(i);
    }

    function scale (scales) {
      const { x: scaleX, y: scaleY } = scales;
      return stream => new Scale(stream, scaleX, scaleY)
    }

    class Scale extends Transformer {
      constructor (stream, scaleX, scaleY) {
        super(stream);
        this.scaleX = scaleX;
        this.scaleY = scaleY;
      }

      point (x, y) { this.stream.point(this.scaleX(x), this.scaleY(y)); }
      moveTo (x, y) { this.stream.moveTo(this.scaleX(x), this.scaleY(y)); }
      lineTo (x, y) { this.stream.lineTo(this.scaleX(x), this.scaleY(y)); }

      quadraticCurveTo (cpx, cpy, x, y) {
        this.stream.quadraticCurveTo(
          this.scaleX(cpx),
          this.scaleY(cpy),
          this.scaleX(x),
          this.scaleY(y)
        );
      }

      bezierCurveTo (cp1x, cp1y, cp2x, cp2y, x, y) {
        this.stream.bezierCurveTo(
          this.scaleX(cp1x),
          this.scaleY(cp1y),
          this.scaleX(cp2x),
          this.scaleY(cp2y),
          this.scaleX(x),
          this.scaleY(y)
        );
      }

      arc (x, y, r, sAngle, eAngle, counterclockwise) {
        this.stream.arc(
          this.scaleX(x),
          this.scaleY(y),
          r,
          sAngle,
          eAngle,
          counterclockwise
        );
      }

      arcTo (x1, y1, x2, y2, r) {
        this.stream.arcTo(
          this.scaleX(x1),
          this.scaleY(y1),
          this.scaleX(x2),
          this.scaleY(y2),
          r
        );
      }

      ellipse (x, y, rx, ry, rotation, sAngle, eAngle, counterclockwise) {
        this.stream.ellipse(
          this.scaleX(x),
          this.scaleY(y),
          rx,
          ry,
          rotation,
          sAngle,
          eAngle,
          counterclockwise
        );
      }

      translate (x, y) {
        this.stream.translate(this.scaleX(x), this.scaleY(y));
      }
    }

    function round (decimals = 0) {
      const roundFn = createRoundFn(decimals);
      return scale({ x: roundFn, y: roundFn })
    }

    function createRoundFn (decimals) {
      const multiplier = Math.pow(10, decimals);
      return n => Math.round(n * multiplier) / multiplier
    }

    function transform$1 (transformers) {
      const { x: transformX, y: transformY } = transformers;
      return stream => new Transform(stream, transformX, transformY)
    }

    class Transform extends Transformer {
      constructor (stream, transformX, transformY) {
        super(stream);
        this.transformX = transformX;
        this.transformY = transformY;
      }

      point (x, y) {
        this.stream.point(this.transformX(x, y), this.transformY(x, y));
      }

      moveTo (x, y) { this.stream.moveTo(this.transformX(x, y), this.transformY(x, y)); }
      lineTo (x, y) { this.stream.lineTo(this.transformX(x, y), this.transformY(x, y)); }

      quadraticCurveTo (cpx, cpy, x, y) {
        this.stream.quadraticCurveTo(
          this.transformX(cpx, cpy),
          this.transformY(cpx, cpy),
          this.transformX(x, y),
          this.transformY(x, y)
        );
      }

      bezierCurveTo (cp1x, cp1y, cp2x, cp2y, x, y) {
        this.stream.bezierCurveTo(
          this.transformX(cp1x, cp1y),
          this.transformY(cp1x, cp1y),
          this.transformX(cp2x, cp2y),
          this.transformY(cp2x, cp2y),
          this.transformX(x, y),
          this.transformY(x, y)
        );
      }

      arc (x, y, r, sAngle, eAngle, counterclockwise) {
        this.stream.arc(
          this.transformX(x, y),
          this.transformY(x, y),
          r,
          sAngle,
          eAngle,
          counterclockwise
        );
      }

      arcTo (x1, y1, x2, y2, r) {
        this.stream.arcTo(
          this.transformX(x1, y1),
          this.transformY(x1, y1),
          this.transformX(x2, y2),
          this.transformY(x2, y2),
          r
        );
      }

      ellipse (x, y, rx, ry, rotation, sAngle, eAngle, counterclockwise) {
        this.stream.ellipse(
          this.transformX(x, y),
          this.transformY(x, y),
          rx,
          ry,
          rotation,
          sAngle,
          eAngle,
          counterclockwise
        );
      }

      translate (x, y) {
        this.stream.translate(this.transformX(x, y), this.transformY(x, y));
      }
    }

    /**
     * An OutputSettings object.
     * @typedef {Object} OutputSettings
     * @property {bolean} [round=true] Whether the output should be rounded off.
     * @property {number} [decimals=0] Number of decimals used to round the output coordinates.
     */

    const DEFAULT_SETTINGS = {
      round: true,
      decimals: 0
    };

    function parseOutputSettings (outputSettings) {
      const parsedOutputSettings = outputSettings || {};

      for (const settingName in DEFAULT_SETTINGS) {
        if (!(settingName in parsedOutputSettings)) {
          parsedOutputSettings[settingName] = DEFAULT_SETTINGS[settingName];
        }
      }

      return parsedOutputSettings
    }

    function propBypassesScaling (prop) {
      return prop.constructor === Function
    }

    function fallback (value, fallbackValue) {
      return isDefined$1(value) ? value : fallbackValue
    }

    function isDefined$1 (prop) {
      return prop !== undefined
    }

    function getPositioningMethod (props) {
      return props.geometry
        ? 'geojson'
        : 'florence'
    }

    function parsePoint (props, section) {
      let { parsedProps, scales } = parsePositioning(props, section);
      parsedProps = parseAesthetics(props, parsedProps);

      return { props: parsedProps, scales }
    }

    function parsePositioning (props, section) {
      const positioningMethod = getPositioningMethod(props);

      if (positioningMethod === 'florence') {
        const bypassScalingX = propBypassesScaling(props.x);
        const bypassScalingY = propBypassesScaling(props.y);

        const parsedProps = {
          x: bypassScalingX ? props.x(section) : props.x,
          y: bypassScalingY ? props.y(section) : props.y
        };

        const scales = {
          x: bypassScalingX ? section.indirectScales.x : section.directScales.x,
          y: bypassScalingY ? section.indirectScales.y : section.directScales.y
        };

        return { parsedProps, scales }
      }

      if (positioningMethod === 'geojson') {
        const bypassScaling = propBypassesScaling(props.geometry);

        const parsedProps = {
          geometry: bypassScaling ? props.geometry(section) : props.geometry
        };

        const scales = bypassScaling ? section.indirectScales : section.directScales;

        return { parsedProps, scales }
      }
    }
    const parseAestheticsPointLayer = parseAesthetics;

    function parseAesthetics (props, parsedProps) {
      parsedProps = parsedProps ?? {};

      parsedProps.radius = fallback(props.radius, 3);
      return parseAesthetics$1(props, parsedProps)
    }

    function parseAesthetics$1 (props, parsedProps) {
      parsedProps = parsedProps ?? {};

      parsedProps.fill = fallback(props.fill, 'black');
      parsedProps.stroke = fallback(props.stroke, 'none');

      if (parsedProps.stroke !== 'none') {
        parsedProps.strokeWidth = fallback(props.strokeWidth, 1);
      }

      OPTIONAL_AESTHETICS.forEach(style => {
        if (props[style]) parsedProps[style] = props[style];
      });

      return parsedProps
    }

    const OPTIONAL_AESTHETICS = [
      'opacity', 'fillOpacity', 'strokeOpacity', 'lineJoin', 'miterLimit',
      'dashArray', 'dashOffset', 'keys', 'clip', 'asOnePath'
    ];

    function toRGBA (_color, opacity) {
      const color = _color in COLOR_NAMES
        ? COLOR_NAMES[_color]
        : _color;

      const colorTranslator = new rt(color);
      colorTranslator.setA(colorTranslator.A * opacity);

      return colorTranslator.RGBA
    }

    // https://stackoverflow.com/a/1573141
    const COLOR_NAMES = {
      aliceblue: '#f0f8ff',
      antiquewhite: '#faebd7',
      aqua: '#00ffff',
      aquamarine: '#7fffd4',
      azure: '#f0ffff',
      beige: '#f5f5dc',
      bisque: '#ffe4c4',
      black: '#000000',
      blanchedalmond: '#ffebcd',
      blue: '#0000ff',
      blueviolet: '#8a2be2',
      brown: '#a52a2a',
      burlywood: '#deb887',
      cadetblue: '#5f9ea0',
      chartreuse: '#7fff00',
      chocolate: '#d2691e',
      coral: '#ff7f50',
      cornflowerblue: '#6495ed',
      cornsilk: '#fff8dc',
      crimson: '#dc143c',
      cyan: '#00ffff',
      darkblue: '#00008b',
      darkcyan: '#008b8b',
      darkgoldenrod: '#b8860b',
      darkgray: '#a9a9a9',
      darkgreen: '#006400',
      darkkhaki: '#bdb76b',
      darkmagenta: '#8b008b',
      darkolivegreen: '#556b2f',
      darkorange: '#ff8c00',
      darkorchid: '#9932cc',
      darkred: '#8b0000',
      darksalmon: '#e9967a',
      darkseagreen: '#8fbc8f',
      darkslateblue: '#483d8b',
      darkslategray: '#2f4f4f',
      darkturquoise: '#00ced1',
      darkviolet: '#9400d3',
      deeppink: '#ff1493',
      deepskyblue: '#00bfff',
      dimgray: '#696969',
      dodgerblue: '#1e90ff',
      firebrick: '#b22222',
      floralwhite: '#fffaf0',
      forestgreen: '#228b22',
      fuchsia: '#ff00ff',
      gainsboro: '#dcdcdc',
      ghostwhite: '#f8f8ff',
      gold: '#ffd700',
      goldenrod: '#daa520',
      gray: '#808080',
      green: '#008000',
      greenyellow: '#adff2f',
      honeydew: '#f0fff0',
      hotpink: '#ff69b4',
      'indianred ': '#cd5c5c',
      indigo: '#4b0082',
      ivory: '#fffff0',
      khaki: '#f0e68c',
      lavender: '#e6e6fa',
      lavenderblush: '#fff0f5',
      lawngreen: '#7cfc00',
      lemonchiffon: '#fffacd',
      lightblue: '#add8e6',
      lightcoral: '#f08080',
      lightcyan: '#e0ffff',
      lightgoldenrodyellow: '#fafad2',
      lightgrey: '#d3d3d3',
      lightgreen: '#90ee90',
      lightpink: '#ffb6c1',
      lightsalmon: '#ffa07a',
      lightseagreen: '#20b2aa',
      lightskyblue: '#87cefa',
      lightslategray: '#778899',
      lightsteelblue: '#b0c4de',
      lightyellow: '#ffffe0',
      lime: '#00ff00',
      limegreen: '#32cd32',
      linen: '#faf0e6',
      magenta: '#ff00ff',
      maroon: '#800000',
      mediumaquamarine: '#66cdaa',
      mediumblue: '#0000cd',
      mediumorchid: '#ba55d3',
      mediumpurple: '#9370d8',
      mediumseagreen: '#3cb371',
      mediumslateblue: '#7b68ee',
      mediumspringgreen: '#00fa9a',
      mediumturquoise: '#48d1cc',
      mediumvioletred: '#c71585',
      midnightblue: '#191970',
      mintcream: '#f5fffa',
      mistyrose: '#ffe4e1',
      moccasin: '#ffe4b5',
      navajowhite: '#ffdead',
      navy: '#000080',
      oldlace: '#fdf5e6',
      olive: '#808000',
      olivedrab: '#6b8e23',
      orange: '#ffa500',
      orangered: '#ff4500',
      orchid: '#da70d6',
      palegoldenrod: '#eee8aa',
      palegreen: '#98fb98',
      paleturquoise: '#afeeee',
      palevioletred: '#d87093',
      papayawhip: '#ffefd5',
      peachpuff: '#ffdab9',
      peru: '#cd853f',
      pink: '#ffc0cb',
      plum: '#dda0dd',
      powderblue: '#b0e0e6',
      purple: '#800080',
      rebeccapurple: '#663399',
      red: '#ff0000',
      rosybrown: '#bc8f8f',
      royalblue: '#4169e1',
      saddlebrown: '#8b4513',
      salmon: '#fa8072',
      sandybrown: '#f4a460',
      seagreen: '#2e8b57',
      seashell: '#fff5ee',
      sienna: '#a0522d',
      silver: '#c0c0c0',
      skyblue: '#87ceeb',
      slateblue: '#6a5acd',
      slategray: '#708090',
      snow: '#fffafa',
      springgreen: '#00ff7f',
      steelblue: '#4682b4',
      tan: '#d2b48c',
      teal: '#008080',
      thistle: '#d8bfd8',
      tomato: '#ff6347',
      turquoise: '#40e0d0',
      violet: '#ee82ee',
      wheat: '#f5deb3',
      white: '#ffffff',
      whitesmoke: '#f5f5f5',
      yellow: '#ffff00',
      yellowgreen: '#9acd32'
    };

    function getFillStyle (props) {
      if (props.fill === 'none') return

      const opacity = isProvided(props.opacity) ? props.opacity : 1;
      const fillOpacity = isProvided(props.fillOpacity) ? props.fillOpacity : 1;

      return toRGBA(props.fill, opacity * fillOpacity)
    }

    function getStrokeStyle (props) {
      if (props.stroke === 'none') return

      const opacity = isProvided(props.opacity) ? props.opacity : 1;
      const strokeOpacity = isProvided(props.strokeOpacity) ? props.strokeOpacity : 1;

      return toRGBA(props.stroke, opacity * strokeOpacity)
    }

    function getFont (props) {
      return props.fontWeight === 'normal'
        ? `${props.fontSize}px ${props.fontFamily}`
        : `${props.fontWeight} ${props.fontSize}px ${props.fontFamily}`
    }

    function getAnchorPoint ({ anchorPoint }) {
      switch (anchorPoint) {
        case 'center':
          return { textAlign: 'center', textBaseline: 'middle' }
        case 'lb':
          return { textAlign: 'start', textBaseline: 'alphabetic' }
        case 'lt':
          return { textAlign: 'start', textBaseline: 'hanging' }
        case 'rt':
          return { textAlign: 'end', textBaseline: 'hanging' }
        case 'rb':
          return { textAlign: 'end', textBaseline: 'alphabetic' }
        case 'l':
          return { textAlign: 'start', textBaseline: 'middle' }
        case 'r':
          return { textAlign: 'end', textBaseline: 'middle' }
        case 'b':
          return { textAlign: 'center', textBaseline: 'alphabetic' }
        case 't':
          return { textAlign: 'center', textBaseline: 'hanging' }
        default: {
          return { textAlign: 'center', textBaseline: 'middle' }
        }
      }
    }

    const isProvided = prop => prop !== undefined;

    const markStyler = {
      apply: applyStyling
    };

    const layerStyler = {
      create (props) {
        const keys = props.keys;

        const getAesthetics = batchAestheticGetter(
          props,
          AESTHETICS,
          keys
        );

        return function apply (context, i) {
          const aesthetics = getAesthetics(i);
          applyStyling(context, aesthetics);
        }
      },

      asOnePath (props) {
        return props.asOnePath && areAllStylesGlobal(props, AESTHETICS)
      }
    };

    const AESTHETICS = [
      'stroke', 'strokeOpacity', 'strokeWidth', 'fill', 'fillOpacity', 'opacity',
      'lineJoin', 'miterLimit', 'dashArray', 'dashOffset'
    ];

    function applyStyling (context, aesthetics) {
      if (aesthetics.lineJoin) {
        context.lineJoin = aesthetics.lineJoin;

        if (aesthetics.lineJoin === 'miter' && aesthetics.miterLimit !== undefined) {
          context.miterLimit = aesthetics.miterLimit;
        }
      }

      if (aesthetics.dashArray) {
        context.setLineDash(aesthetics.dashArray.split(' ').map(x => parseInt(x)));

        if (aesthetics.dashOffset) {
          context.lineDashOffset = aesthetics.dashOffset;
        }
      }

      const strokeStyle = getStrokeStyle(aesthetics);
      const fillStyle = getFillStyle(aesthetics);

      if (fillStyle) {
        context.fillStyle = fillStyle;
        context.fill();
      }

      if (strokeStyle) {
        context.lineWidth = aesthetics.strokeWidth;
        context.strokeStyle = strokeStyle;
        context.stroke();
      }
    }

    // Inspired by https://github.com/d3/d3-geo/blob/master/src/stream.js
    function streamGeometry (geometry, stream, i) {
      streamGeometryType[geometry.type](
        geometry.coordinates,
        stream,
        i
      );
    }

    function streamGeometries (geometries, stream) {
      let i = -1;

      while (++i < geometries.length) {
        const geometry = geometries[i];
        streamGeometryType[geometry.type](
          geometry.coordinates,
          stream,
          i
        );
        stream.markEnd();
      }
    }

    const streamGeometryType = {
      Point (c, stream, i) {
        stream.point(c[0], c[1]);
      },
      LineString (c, stream, i) {
        streamLineString(c, stream);
      },
      Polygon (c, stream, i) {
        streamPolygon$1(c, stream);
      },
      MultiLineString (c, stream, i) {
        let j = -1;

        while (++j < c.length) {
          stream.submarkStart();
          streamLineString(c[j], stream);
        }
      },
      MultiPolygon (c, stream, i) {
        let j = -1;

        while (++j < c.length) {
          stream.submarkStart();
          streamPolygon$1(c[j], stream);
        }
      }
    };

    function streamLineString (c, stream, closed = 0) {
      stream.lineStart();
      streamCoordArray(c, stream, closed);
      stream.lineEnd();
    }

    function streamPolygon$1 (c, stream) {
      let i = -1;
      stream.polygonStart();
      while (++i < c.length) streamLineString(c[i], stream, 1);
      stream.polygonEnd();
    }

    function streamCoordArray (c, stream, closed = 0) {
      let i = -1;
      const n = c.length - closed;
      while (++i < n) stream.point(c[i][0], c[i][1]);
    }

    function curveLinear (context) {
      return new CurveLinear(context)
    }

    // https://github.com/d3/d3-geo/blob/master/src/path/context.js
    // TODO enable curves for polygons?
    function CurveLinear (context) {
      this._context = context;
    }

    CurveLinear.prototype = {
      polygonStart () {
        this._line = 0;
      },
      polygonEnd () {
        this._line = NaN;
      },
      lineStart () {
        this._point = 0;
      },
      lineEnd () {
        if (this._line === 0) this._context.closePath();
        this._point = NaN;
      },
      point (x, y) {
        switch (this._point) {
          case 0: {
            this._context.moveTo(x, y);
            this._point = 1;
            break
          }
          default: {
            this._context.lineTo(x, y);
          }
        }
      }
    };

    function createPipeline$2 (props, section, scales, context, outputSettings) {
      return chain(
        scale(scales),
        section.coordinateSystem ? polarConnector(section.coordinateSystem) : null,
        outputSettings.round ? round(outputSettings.decimals) : null,
        section.coordinateSystem ? null : curveLinear,
        context
      )
    }

    function polarConnector (coordinateSystem) {
      return context => new PolarConnector(coordinateSystem, context)
    }

    class PolarConnector {
      constructor (coordinateSystem, context) {
        this._coordinateSystem = coordinateSystem;
        this._context = context;
        this._overallDirectionIsClockwise = overallDirectionIsClockwise(coordinateSystem);
      }

      polygonStart () {
        this._line = 0;
        this._arc = 0;
      }

      polygonEnd () {
        this._line = NaN;
      }

      lineStart () {
        this._point = 0;
      }

      lineEnd () {
        if (this._line === 0) this._context.closePath();
        this._point = NaN;
      }

      point (theta, r) {
        const x = this._coordinateSystem.x(theta, r);
        const y = this._coordinateSystem.y(theta, r);

        const adjustedTheta = adjustTheta(theta, this._coordinateSystem);

        switch (this._point) {
          case 0: {
            this._context.moveTo(x, y);
            this._point = 1;
            this._lastTheta = adjustedTheta;
            break
          }
          default: {
            this._handlePolarSegment(x, y, adjustedTheta, r);
            this._lastTheta = adjustedTheta;
          }
        }
      }

      _handlePolarSegment (x, y, theta, r) {
        if (this._lastTheta === theta) {
          this._context.lineTo(x, y);
        } else {
          const { midX, midY, halfWidth, halfHeight } = this._coordinateSystem;
          const ccw = getCcw(this._arc, this._overallDirectionIsClockwise);

          this._context.ellipse(
            midX,
            midY,
            halfWidth * r,
            halfHeight * r,
            0,
            this._lastTheta,
            theta,
            ccw
          );

          this._arc = 1;
        }
      }
    }

    const TWO_PI$2 = Math.PI * 2;

    function adjustTheta (theta, { flipX, flipY }) {
      if (!flipY && !flipX) return theta
      if (flipY && !flipX) return TWO_PI$2 - theta
      if (!flipY && flipX) return Math.PI - theta
      return Math.PI + theta
    }

    function overallDirectionIsClockwise ({ flipX, flipY }) {
      if (!flipY && !flipX) return true
      if (flipY && !flipX) return false
      if (!flipY && flipX) return false
      return true
    }

    function getCcw (arc, overallDirectionIsClockwise) {
      if (arc === 0 && overallDirectionIsClockwise) return 0
      if (arc === 1 && overallDirectionIsClockwise) return 1
      if (arc === 0 && !overallDirectionIsClockwise) return 1
      return 0
    }

    function createPipeline$3 (props, section, scales, context, outputSettings) {
      return chain(
        scale(scales),
        section.coordinateSystem && !props._resampleIntervals ? transform$1(section.coordinateSystem) : null,
        section.coordinateSystem && props._resampleIntervals ? polarConnector(section.coordinateSystem) : props.curve,
        outputSettings.round ? round(outputSettings.decimals) : null,
        context
      )
    }

    function parseLine (props, section) {
      const { parsedProps, scales } = parsePositioning(props, section);
      parseAesthetics$3(props, parsedProps);

      return { props: parsedProps, scales }
    }

    const parseAestheticsLine = parseAesthetics$3;
    const parseAestheticsLineLayer = parseAesthetics$3;

    function parseAesthetics$3 (props, parsedProps) {
      parsedProps = parsedProps ?? {};

      parsedProps.curve = fallback(props.curve, curveLinear$1);
      parsedProps.strokeWidth = fallback(props.strokeWidth, 3);
      parsedProps.stroke = fallback(props.stroke, 'black');

      OPTIONAL_AESTHETICS$1.forEach(style => {
        if (props[style]) parsedProps[style] = props[style];
      });

      return parsedProps
    }

    const OPTIONAL_AESTHETICS$1 = [
      'opacity', 'lineCap', 'lineJoin', 'miterLimit',
      'dashArray', 'dashOffset', 'opacity', 'keys', 'clip', 'asOnePath',
      '_resampleIntervals'
    ];

    const markStyler$1 = {
      apply: applyStyling$1
    };

    const layerStyler$1 = {
      create (props) {
        const keys = props.keys;

        const getAesthetics = batchAestheticGetter(
          props,
          AESTHETICS$1,
          keys
        );

        return function apply (context, i) {
          const aesthetics = getAesthetics(i);
          applyStyling$1(context, aesthetics);
        }
      },

      asOnePath (props) {
        return props.asOnePath && areAllStylesGlobal(props, AESTHETICS$1)
      }
    };

    const AESTHETICS$1 = [
      'stroke', 'strokeWidth', 'opacity',
      'lineCap', 'lineJoin', 'miterLimit', 'dashArray', 'dashOffset'
    ];

    function applyStyling$1 (context, aesthetics) {
      if (aesthetics.lineCap) {
        context.lineCap = aesthetics.lineCap;
      }

      if (aesthetics.lineJoin) {
        context.lineJoin = aesthetics.lineJoin;

        if (aesthetics.lineJoin === 'miter' && aesthetics.miterLimit !== undefined) {
          context.miterLimit = aesthetics.miterLimit;
        }
      }

      if (aesthetics.dashArray) {
        context.setLineDash(aesthetics.dashArray.split(' ').map(x => parseInt(x)));

        if (aesthetics.dashOffset) {
          context.lineDashOffset = aesthetics.dashOffset;
        }
      }

      const strokeStyle = getStrokeStyle(aesthetics);

      context.lineWidth = aesthetics.strokeWidth;
      context.strokeStyle = strokeStyle;
      context.fillStyle = 'none';
      context.stroke();
    }

    /**
     * Creates a Line mark.
     *
     * Valid prop combinations for positioning include:
     *  - x and y
     *  - geometry
     *
     * @param {object} props
     * @param {Array|function} props.x An array of x-coordinates, or a function that returns an array of original x-coordinates.
     * @param {Array|function} props.y An array of y-coordinates, or a function that returns an array of original y-coordinates.
     * @param {Object} [props.geometry] A GeoJSON LineString or MultiLineString geometry.
     * @param {Object} [props.curve=d3shape.curveLinear] A d3-shape curve.
     * @param {string} [props.stroke='black'] The stroke color. Can be in named, hex, rgb, rgba, hsl or hsla format, or 'none'.
     * @param {number} [props.strokeWidth=3] The stroke width in pixels.
     * @param {number} [props.opacity=1] The overall opacity. Must be a value between 0 and 1.
     * @param {string} [props.lineCap='butt'] Controls the endings of line strokes. Can be 'butt', 'round' or 'square'.
     * @param {string} [props.lineJoin='bevel'] Controls how lines are joined. Can be 'bevel', 'round' or 'miter'.
     * @param {number} [props.miterLimit=10] Sets limit in pixels for miter lineJoins.
     * @param {string} [props.dashArray] String of numbers representing pixels, separated by spaces, used to create dash patterns.
     * @param {number} [props.dashOffset] Pixel value to offset dash patterns.
     * @param {string} [props.clip] Overrides the clipping mode of the parent section. Can be 'padding' or 'outer'.
     * @param {boolean} [props._resampleIntervals=false] Resamples line intervals if parent section has coordinate system other than cartesian.
     * @param {Section} section
     * @param {OutputSettings} [outputSettings]
     *
     * @return {Mark} A Mark object.
     */
    function createLine (_props, section, outputSettings) {
      const { props, scales } = parseLine(_props, section);
      outputSettings = parseOutputSettings(outputSettings);

      const positioning = getPositioning$2(props, section, scales, outputSettings);

      return new Mark$1(
        positioning,
        props,
        section,
        markStyler$1,
        'Line'
      )
    }

    function getPositioning$2 (props, section, scales, outputSettings) {
      const positioningMethod = getPositioningMethod(props);
      const markRecorder = recorderMark();

      const pipeline = createPipeline$3(props, section, scales, markRecorder, outputSettings);

      if (positioningMethod === 'florence') {
        streamLine(props, pipeline);
      }

      if (positioningMethod === 'geojson') {
        streamGeometry(props.geometry, pipeline);
      }

      return markRecorder.result()
    }

    function createMarkPipeline (props, section, scales, context, outputSettings) {
      return chain(
        scale(scales),
        section.coordinateSystem ? transform$1(section.coordinateSystem) : null,
        outputSettings.round ? round(outputSettings.decimals) : null,
        labelConnector(props),
        context
      )
    }

    function createLayerPipeline (props, section, scales, context, outputSettings) {
      return chain(
        scale(scales),
        section.coordinateSystem ? transform$1(section.coordinateSystem) : null,
        outputSettings.round ? round(outputSettings.decimals) : null,
        labelLayerConnector(props),
        context
      )
    }

    function labelConnector (props) {
      return function (context) {
        return {
          point (x, y) {
            context.translate(x, y);

            if (props.rotate) {
              context.rotate(props.rotate);
            }
          }
        }
      }
    }

    function labelLayerConnector (props) {
      const keys = props.keys;
      const getRotate = aestheticGetter(props.rotate, keys);

      let currentLabel = 0;

      return function (context) {
        return {
          point (x, y) {
            const rotate = getRotate(currentLabel);

            context.translate(x, y);

            if (rotate) {
              context.rotate(rotate);
            }

            currentLabel++;
          }
        }
      }
    }

    function parseLabel (props, section) {
      let { parsedProps, scales } = parsePositioning(props, section);
      parsedProps = parseAesthetics$4(props, parsedProps);

      return { props: parsedProps, scales }
    }

    const parseAestheticsLabel = parseAesthetics$4;
    const parseAestheticsLabelLayer = parseAesthetics$4;

    function parseAesthetics$4 (props, parsedProps) {
      parsedProps = parsedProps ?? {};

      parsedProps.text = fallback(props.text, 'Text');
      if (props.rotate) parsedProps.rotate = props.rotate;
      parsedProps.anchorPoint = fallback(props.anchorPoint, 'center');
      parsedProps.fontSize = fallback(props.fontSize, 16);
      parsedProps.fontFamily = fallback(props.fontFamily, 'Helvetica');
      parsedProps.fontWeight = fallback(props.fontWeight, 'normal');

      return parseAesthetics$1(props, parsedProps)
    }

    const markStyler$2 = {
      apply (context, props) {
        const font = getFont(props);
        const anchorPoint = getAnchorPoint(props);
        const strokeStyle = getStrokeStyle(props);
        const fillStyle = getFillStyle(props);

        applyStyling$2(
          context,
          font,
          anchorPoint,
          fillStyle,
          props.text,
          strokeStyle,
          props.strokeWidth
        );
      }
    };

    const layerStyler$2 = {
      create (props) {
        const keys = props.keys;

        const getAesthetics = batchAestheticGetter(
          props,
          AESTHETICS$2,
          keys
        );

        const getText = aestheticGetter(props.text, keys);

        return function apply (context, i) {
          const text = getText(i);
          const aesthetics = getAesthetics(i);
          const font = getFont(aesthetics);
          const anchorPoint = getAnchorPoint(aesthetics);
          const strokeStyle = getStrokeStyle(aesthetics);
          const fillStyle = getFillStyle(aesthetics);

          applyStyling$2(
            context,
            font,
            anchorPoint,
            fillStyle,
            text,
            strokeStyle,
            aesthetics.strokeWidth
          );
        }
      },

      asOnePath () { return false }
    };

    const AESTHETICS$2 = [
      'fontWeight', 'fontSize', 'fontFamily', 'stroke', 'strokeOpacity',
      'strokeWidth', 'fill', 'fillOpacity', 'opacity', 'anchorPoint'
    ];

    function applyStyling$2 (context, font, anchorPoint, fillStyle, text, strokeStyle, strokeWidth) {
      context.font = font;
      context.textBaseline = anchorPoint.textBaseline;
      context.textAlign = anchorPoint.textAlign;

      if (fillStyle) {
        context.fillStyle = fillStyle;
        context.fillText(text, 0, 0);
      }

      if (strokeStyle) {
        context.lineWidth = strokeWidth;
        context.strokeStyle = strokeStyle;
        context.strokeText(text, 0, 0);
      }

      context.setTransform(1, 0, 0, 1, 0, 0);
    }

    /**
     * Creates a Label mark.
     *
     * Valid prop combinations for positioning include:
     *  - x and y
     *  - geometry
     *
     * @param {Object} props
     * @param {*} [props.x] A x-coordinate, or a function that returns an original x-coordinate.
     * @param {*} [props.y] A y-coordinate, or a function that returns an original y-coordinate.
     * @param {Object} [props.geometry] A GeoJSON Point geometry.
     * @param {string} [props.text='Text'] The text that the label should display.
     * @param {number} [props.rotate=0] The text rotation around the anchor point in radians.
     * @param {string} [props.anchorPoint='center'] Can be 'center', 'lt', 'lb', 'rt', 'rb', 'l', 'r', 't', or 'b'.
     * @param {number} [props.fontSize=16] The font size in pixels.
     * @param {string} [props.fontFamily='Helvetica'] The font family.
     * @param {(string|number)} [props.fontWeight='normal'] The font weight.
     * @param {string} [props.fill='black'] The fill color. Can be in named, hex, rgb, rgba, hsl or hsla format, or 'none'.
     * @param {string} [props.stroke='none'] The stroke color. Can be in named, hex, rgb, rgba, hsl or hsla format, or 'none'.
     * @param {number} [props.strokeWidth=1] The stroke width in pixels.
     * @param {number} [props.opacity=1] The overall opacity. Must be a value between 0 and 1.
     * @param {number} [props.fillOpacity=1] The fill opacity. Must be a value between 0 and 1.
     * @param {number} [props.strokeOpacity=1] The stroke opacity. Must be a value between 0 and 1.
     * @param {string} [props.clip] Overrides the clipping mode of the parent section. Can be 'padding' or 'outer'.
     * @param {Section} section
     * @param {OutputSettings} [outputSettings]
     *
     * @return {Mark} A Mark object.
     */
    function createLabel (_props, section, outputSettings) {
      const { props, scales } = parseLabel(_props, section);
      outputSettings = parseOutputSettings(outputSettings);

      const positioning = getPositioning$3(props, section, scales, outputSettings);

      return new Mark$1(
        positioning,
        props,
        section,
        markStyler$2,
        'Label'
      )
    }

    function getPositioning$3 (props, section, scales, outputSettings) {
      const positioningMethod = getPositioningMethod(props);
      const markRecorder = recorderLabel();

      const pipeline = createMarkPipeline(props, section, scales, markRecorder, outputSettings);

      if (positioningMethod === 'florence') {
        streamPoint(props, pipeline);
      }

      if (positioningMethod === 'geojson') {
        streamGeometry(props.geometry, pipeline);
      }

      return markRecorder.result()
    }

    /**
     * Creates a Label layer.
     *
     * Valid prop combinations for positioning include:
     *  - x and y
     *  - geometry
     *
     * @param {Object} props
     * @param {Array|function} [props.x] An array of x-coordinates, or a function that returns an array of original x-coordinates.
     * @param {Array|function} [props.y] An array of y-coordinates, or a function that returns an array of original y-coordinates.
     * @param {Object[]} [props.geometry] An array of GeoJSON Point geometries.
     * @param {string|string[]|function} [props.text='Text'] The text that the label should display.
     * @param {number|number[]|function} [props.rotate=0] The text rotation around the anchor point in radians.
     * @param {string|string[]|function} [props.anchorPoint='center'] Can be 'center', 'lt', 'lb', 'rt', 'rb', 'l', 'r', 't', or 'b'.
     * @param {number|number[]|function} [props.fontSize=16] The font size in pixels.
     * @param {string|string[]|function} [props.fontFamily='Helvetica'] The font family.
     * @param {string|string[]|function} [props.fontWeight='normal'] The font weight.
     * @param {string|string[]|function} [props.fill='black'] The fill color. Can be in named, hex, rgb, rgba, hsl or hsla format, or 'none'.
     * @param {string|string[]|function} [props.stroke='none'] The stroke color. Can be in named, hex, rgb, rgba, hsl or hsla format, or 'none'.
     * @param {number|number[]|function} [props.strokeWidth=1] The stroke width in pixels.
     * @param {number|number[]|function} [props.opacity=1] The overall opacity. Must be a value between 0 and 1.
     * @param {number|number[]|function} [props.fillOpacity=1] The fill opacity. Must be a value between 0 and 1.
     * @param {number|number[]|function} [props.strokeOpacity=1] The stroke opacity. Must be a value between 0 and 1.
     * @param {string[]} [props.keys] An array of unique keys. Must be strings.
     * @param {string} [props.clip] Overrides the clipping mode of the parent section. Can be 'padding' or 'outer'.
     * @param {Section} section
     * @param {OutputSettings} [outputSettings]
     *
     * @return {Layer} A Layer object.
     */
    function createLabelLayer (_props, section, outputSettings) {
      const { props, scales } = parseLabel(_props, section);
      outputSettings = parseOutputSettings(outputSettings);

      const positioning = getPositioning$4(props, section, scales, outputSettings);

      return new Layer$1(
        positioning,
        props,
        section,
        layerStyler$2,
        'Label'
      )
    }

    function getPositioning$4 (props, section, scales, outputSettings) {
      const positioningMethod = getPositioningMethod(props);
      const layerRecorder = recorderLabelLayer();

      const pipeline = createLayerPipeline(props, section, scales, layerRecorder, outputSettings);

      if (positioningMethod === 'florence') {
        streamPointLayer(props, pipeline);
      }

      if (positioningMethod === 'geojson') {
        streamGeometries(props.geometry, pipeline);
      }

      return layerRecorder.result()
    }

    /**
     * Creates a Line layer.
     *
     * Valid prop combinations for positioning include:
     *  - x and y
     *  - geometry
     *
     * @param {object} props
     * @param {(Array.<Array>|function)} props.x An array of x-coordinates, or a function that returns an array of original x-coordinates.
     * @param {(Array.<Array>|function)} props.y An array of y-coordinates, or a function that returns an array of original y-coordinates.
     * @param {Object[]} [props.geometry] An array of GeoJSON LineString or MultiLineString geometries.
     * @param {Object} [props.curve=d3shape.curveLinear] A d3-shape curve.
     * @param {(string|string[]|function)} [props.stroke='black'] The stroke color. Can be in named, hex, rgb, rgba, hsl or hsla format, or 'none'.
     * @param {(number|number[]|function)} [props.strokeWidth=3] The stroke width in pixels.
     * @param {(number|number[]|function)} [props.opacity=1] The overall opacity. Must be a value between 0 and 1.
     * @param {(string|string[]|function)} [props.lineCap='butt'] Controls the endings of line strokes. Can be 'butt', 'round' or 'square'.
     * @param {(string|string[]|function)} [props.lineJoin='bevel'] Controls how lines are joined. Can be 'bevel', 'round' or 'miter'.
     * @param {(number|number[]|function)} [props.miterLimit=10] Sets limit in pixels for miter lineJoins.
     * @param {(string|string[]|function)} [props.dashArray] String of numbers representing pixels, separated by spaces, used to create dash patterns.
     * @param {(number|number[]|function)} [props.dashOffset] Pixel value to offset dash patterns.
     * @param {string[]} [props.keys] An array of unique keys. Must be strings.
     * @param {string} [props.clip] Overrides the clipping mode of the parent section. Can be 'padding' or 'outer'.
     * @param {boolean} [props.asOnePath=false] If true, draws whole layer as one path.
     * @param {boolean} [props._resampleIntervals=false] Resamples line intervals if parent section has coordinate system other than cartesian.
     * @param {Section} section
     * @param {OutputSettings} [outputSettings]
     *
     * @return {Layer} A Layer object.
     */
    function createLineLayer (_props, section, outputSettings) {
      const { props, scales } = parseLine(_props, section);
      outputSettings = parseOutputSettings(outputSettings);

      const positioning = getPositioning$5(props, section, scales, outputSettings);

      return new Layer$1(
        positioning,
        props,
        section,
        layerStyler$1,
        'Line'
      )
    }

    function getPositioning$5 (props, section, scales, outputSettings) {
      const positioningMethod = getPositioningMethod(props);
      const layerRecorder = recorderLayer();

      const pipeline = createPipeline$3(props, section, scales, layerRecorder, outputSettings);

      if (positioningMethod === 'florence') {
        streamLineLayer(props, pipeline);
      }

      if (positioningMethod === 'geojson') {
        streamGeometries(props.geometry, pipeline);
      }

      return layerRecorder.result()
    }

    function createLayerPipeline$1 (props, section, scales, context, outputSettings) {
      return chain(
        scale(scales),
        section.coordinateSystem ? transform$1(section.coordinateSystem) : null,
        round(outputSettings.decimals),
        pointLayerConnector(props),
        context
      )
    }

    const TAU = 2 * Math.PI;

    function pointLayerConnector (props) {
      const keys = props.keys;
      const getRadius = aestheticGetter(props.radius, keys);

      let currentPoint = 0;

      return function (context) {
        return {
          point (x, y) {
            const radius = getRadius(currentPoint);
            context.moveTo(x + radius, y);
            context.arc(x, y, radius, 0, TAU);

            currentPoint++;
          }
        }
      }
    }

    /**
     * Creates a Point layer.
     *
     * Valid prop combinations for positioning include:
     *  - x and y
     *  - geometry
     *
     * @param {Object} props
     * @param {Array|function} props.x An array of x-coordinates, or a function that returns an array of original x-coordinates.
     * @param {Array|function} props.y An array of y-coordinates, or a function that returns an array of original y-coordinates.
     * @param {Object[]} [props.geometry] An array of GeoJSON Point geometries.
     * @param {number|number[]|function} [props.radius=3] The radius of the point in pixels.
     * @param {string|string[]|function} [props.fill='black'] The fill color. Can be in named, hex, rgb, rgba, hsl or hsla format, or 'none'.
     * @param {string|string[]|function} [props.stroke='none'] The stroke color. Can be in named, hex, rgb, rgba, hsl or hsla format, or 'none'.
     * @param {number|number[]|function} [props.strokeWidth=1] The stroke width in pixels.
     * @param {number|number[]|function} [props.opacity=1] The overall opacity. Must be a value between 0 and 1.
     * @param {number|number[]|function} [props.fillOpacity=1] The fill opacity. Must be a value between 0 and 1.
     * @param {number|number[]|function} [props.strokeOpacity=1] The stroke opacity. Must be a value between 0 and 1.
     * @param {(string|string[]|function)} [props.lineCap='butt'] Controls the endings of line strokes. Can be 'butt', 'round' or 'square'.
     * @param {(string|string[]|function)} [props.dashArray] String of numbers representing pixels, separated by spaces, used to create dash patterns.
     * @param {(number|number[]|function)} [props.dashOffset] Pixel value to offset dash patterns.
     * @param {string[]} [props.keys] An array of unique keys. Must be strings.
     * @param {string} [props.clip] Overrides the clipping mode of the parent section. Can be 'padding' or 'outer'.
     * @param {boolean} [props.asOnePath=false] If true, draws whole layer as one path. Currently only works for canvas.
     * @param {Section} section
     * @param {OutputSettings} [outputSettings]
     *
     * @return {Layer} A Layer object.
     */
    function createPointLayer (_props, section, outputSettings) {
      const { props, scales } = parsePoint(_props, section);
      outputSettings = parseOutputSettings(outputSettings);

      const positioning = getPositioning$7(props, section, scales, outputSettings);

      return new Layer$1(
        positioning,
        props,
        section,
        layerStyler,
        'Point'
      )
    }

    function getPositioning$7 (props, section, scales, outputSettings) {
      const layerRecorder = recorderLayer();
      stream$1(props, section, scales, layerRecorder, outputSettings);

      return layerRecorder.result()
    }

    function stream$1 (props, section, scales, context, outputSettings) {
      const positioningMethod = getPositioningMethod(props);

      const pipeline = createLayerPipeline$1(props, section, scales, context, outputSettings);

      if (positioningMethod === 'florence') {
        streamPointLayer(props, pipeline);
      }

      if (positioningMethod === 'geojson') {
        streamGeometries(props.geometry, pipeline);
      }
    }

    const parseRectangle = parser(parsePositioning$1);

    function parsePositioning$1 ({ x1, x2, y1, y2 }, section) {
      const rangeX = section.scaleX.range();
      const rangeY = section.scaleY.range();

      return {
        x1: isDefined$1(x1) ? getCoordX$1(x1, section) : rangeX[0],
        x2: isDefined$1(x2) ? getCoordX$1(x2, section) : rangeX[1],
        y1: isDefined$1(y1) ? getCoordY$1(y1, section) : rangeY[0],
        y2: isDefined$1(y2) ? getCoordY$1(y2, section) : rangeY[1]
      }
    }

    const parseAestheticsRectangle = parseAesthetics$1;

    function parser (positioningFn) {
      return function (props, section) {
        const parsedProps = positioningFn(props, section);
        parseAesthetics$1(props, parsedProps);

        return parsedProps
      }
    }

    const getCoordX$1 = coordGetter$1('scaleX');
    const getCoordY$1 = coordGetter$1('scaleY');

    function coordGetter$1 (scale) {
      return function (coord, section) {
        if (propBypassesScaling(coord)) {
          return coord(section)
        }

        return section[scale](coord)
      }
    }

    /**
     * Creates a Rectangle mark.
     *
     * Any positioning prop (i.e. x1, x2 etc) can be left out, in which case it will be replaced
     * by the corresponding padded extent of the parent section. So for example, leaving out all of them
     * will simply draw a rectangle the size of the padded area of the parent section.
     *
     * @param {Object} props
     * @param {*} [props.x1] A x-coordinate, or a function that returns an original x-coordinate.
     * @param {*} [props.x2] A x-coordinate, or a function that returns an original x-coordinate.
     * @param {*} [props.y1] A y-coordinate, or a function that returns an original y-coordinate.
     * @param {*} [props.y2] A y-coordinate, or a function that returns an original y-coordinate.
     * @param {string} [props.fill='black'] The fill color. Can be in named, hex, rgb, rgba, hsl or hsla format, or 'none'.
     * @param {string} [props.stroke='none'] The stroke color. Can be in named, hex, rgb, rgba, hsl or hsla format, or 'none'.
     * @param {number} [props.strokeWidth=1] The stroke width in pixels.
     * @param {number} [props.opacity=1] The overall opacity. Must be a value between 0 and 1.
     * @param {number} [props.fillOpacity=1] The fill opacity. Must be a value between 0 and 1.
     * @param {number} [props.strokeOpacity=1] The stroke opacity. Must be a value between 0 and 1.
     * @param {string} [props.lineCap='butt'] Controls the endings of line strokes. Can be 'butt', 'round' or 'square'.
     * @param {string} [props.lineJoin='bevel'] Controls how lines are joined. Can be 'bevel', 'round' or 'miter'.
     * @param {number} [props.miterLimit=10] Sets limit in pixels for miter lineJoins.
     * @param {string} [props.dashArray] String of numbers representing pixels, separated by spaces, used to create dash patterns.
     * @param {number} [props.dashOffset] Pixel value to offset dash patterns.
     * @param {string} [props.clip] Overrides the clipping mode of the parent section. Can be 'padding' or 'outer'.
     * @param {Section} section
     * @param {OutputSettings} [outputSettings]
     *
     * @return {Mark} A Mark object.
     */
    function createRectangle (_props, section, outputSettings) {
      const props = parseRectangle(_props, section);
      outputSettings = parseOutputSettings(outputSettings);

      const positioning = getPositioning$a(props, section, outputSettings);

      return new Mark$1(
        positioning,
        props,
        section,
        markStyler,
        'Rectangle'
      )
    }

    function getPositioning$a (props, section, outputSettings) {
      const markRecorder = recorderMark();

      const pipeline = createPipeline$2(props, section, section.indirectScales, markRecorder, outputSettings);

      streamRectangle(props, pipeline);

      return markRecorder.result()
    }

    function createScales ({ scaleX, scaleY }, { rangeX, rangeY }, { addInvert } = {}) {
      return {
        x: createScale(scaleX, rangeX, addInvert),
        y: createScale(scaleY, rangeY, addInvert)
      }
    }

    function createScale (scale, range, addInvert) {
      if (scale.constructor === Array) {
        return linear().domain(scale).range(range)
      }

      const newScale = scale.copy().range(range);

      if (addInvert) {
        newScale.invert = createInvertMethod(newScale);
      }

      return newScale
    }

    /*
     * Taken from react-vis:
     * https://github.com/uber/react-vis/blob/master/src/utils/scales-utils.js#L161
     *
     * By default, d3.scaleBand and d3.scalePoint do not have an .invert method, which is why
     * we are doing this. There are some PRs open for this, though, so hopefully we can
     * get rid of this in the future:
     * - https://github.com/d3/d3-scale/pull/151
     * - https://github.com/d3/d3-scale/pull/60
     */
    function createInvertMethod (scale) {
      if (scale.invert) {
        return scale.invert
      }

      return function invert (value) {
        const [lower, upper] = scale.range();
        const start = Math.min(lower, upper);
        const stop = Math.max(lower, upper);

        const flipped = upper < lower;

        const domain = scale.domain();
        const lastIndex = domain.length - 1;

        if (value < start + scale.padding() * scale.step()) {
          return domain[0]
        }

        if (value > stop - scale.padding() * scale.step()) {
          return domain[lastIndex]
        }

        let index;

        if (isPointScale(scale)) {
          index = Math.round((value - start - scale.padding() * scale.step()) / scale.step());
        }

        if (isBandScale(scale)) {
          index = Math.floor((value - start - scale.padding() * scale.step()) / scale.step());
          if (index > lastIndex) index = lastIndex;
        }

        return domain[flipped ? lastIndex - index : index]
      }
    }

    function isPointScale (scale) {
      return !('paddingInner' in scale)
    }

    function isBandScale (scale) {
      return 'paddingInner' in scale
    }

    /**
     * Cartesian coordinate system factory.
     *
     * @return {function} A function that generates a cartesian coordinate system.
     */
    function cartesian () {
      return function (props, sectionData) {
        const { ranges } = sectionData;
        const scales = parseScales(props, DEFAULT_DOMAINS);

        const { x: scaleX, y: scaleY } = createScales(scales, DEFAULT_RANGES);
        const directScales = createScales(scales, ranges, { addInvert: true });
        const indirectScales = createScales(DEFAULT_DOMAINS, ranges);

        const inverseTotalTransformation = ([x, y]) => ([
          directScales.x.invert(x),
          directScales.y.invert(y)
        ]);

        return {
          ...sectionData,
          type: 'cartesian',
          scaleX,
          scaleY,
          directScales,
          indirectScales,
          inverseTotalTransformation,
          bwx: scaleX.bandwidth,
          bwy: scaleY.bandwidth,
          px: getPixelMethod(ranges.rangeX),
          py: getPixelMethod(ranges.rangeY),
          pxAt: indirectScales.x.invert,
          pyAt: indirectScales.y.invert
        }
      }
    }

    function parseScales (props, defaultDomains) {
      return {
        scaleX: props.scaleX ?? defaultDomains.scaleX,
        scaleY: props.scaleY ?? defaultDomains.scaleY
      }
    }

    const DEFAULT_RANGES = {
      rangeX: [0, 1],
      rangeY: [0, 1]
    };

    const DEFAULT_DOMAINS = {
      scaleX: [0, 1],
      scaleY: [0, 1]
    };

    function getPixelMethod ([a, b]) {
      const factor = b - a;
      if (factor === 0) return () => 0
      return v => v / factor
    }

    function parseSection (props, parentSection) {
      const positioning = getPositioning$c(props, parentSection);

      return {
        ...positioning,
        coordinates: fallback(props.coordinates, cartesian()),
        scaleX: props.scaleX,
        scaleY: props.scaleY,
        flipX: fallback(props.flipX, false),
        flipY: fallback(props.flipY, false),
        padding: fallback(props.padding, 0),
        zoomIdentity: props.zoomIdentity,
        clip: fallback(props.clip, 'padding'),
        id: props.id
      }
    }

    function getPositioning$c (props, parentSection) {
      if (!parentSection) {
        return {
          x1: props.x1,
          x2: props.x2,
          y1: props.y1,
          y2: props.y2
        }
      }

      const positioning = parsePositioning$1(props, parentSection);

      const { x, y } = parentSection.indirectScales;

      return {
        x1: x(positioning.x1),
        x2: x(positioning.x2),
        y1: y(positioning.y1),
        y2: y(positioning.y2)
      }
    }

    /**
     * A padding object.
     * @typedef {Object} Padding
     * @property {number} [left=0] Left padding in pixels.
     * @property {number} [right=0] Right padding in pixels.
     * @property {number} [top=0] Top padding in pixels.
     * @property {number} [bottom=0] Bottom padding in pixels.
     *
     */

    function parsePadding (_padding) {
      const padding = _padding === undefined
        ? 0
        : _padding;

      if (padding.constructor === Number) {
        return { left: padding, right: padding, top: padding, bottom: padding }
      }

      if (padding.constructor === Object) {
        return Object.assign(
          parsePadding(0),
          padding
        )
      }

      throw invalidPaddingError
    }

    const invalidPaddingError = new Error('Invalid padding specification');

    function applyPadding (range, offsetMin, offsetMax) {
      warnIfPaddingSmallerThanRange(range, offsetMin, offsetMax);

      if (range[0] < range[1]) {
        return [range[0] + offsetMin, range[1] - offsetMax]
      } else {
        return [range[0] - offsetMax, range[1] + offsetMin]
      }
    }

    function warnIfPaddingSmallerThanRange (range, min, max) {
      if (Math.abs(range[0] - range[1]) < (min + max)) {
        console.warn('Padding cannot exceed width or height');
      }
    }

    function getRanges (props, padding) {
      const { flipX, flipY, zoomIdentity } = props;
      let { rangeX, rangeY } = initRanges(props);
      const { left, right, top, bottom } = padding;

      rangeX = applyFlip(rangeX, flipX);
      rangeX = applyPadding(rangeX, left, right);

      if (zoomIdentity) {
        validateZoomFactor(zoomIdentity.kx);
        rangeX = applyZoom(rangeX, zoomIdentity.kx, zoomIdentity.x);
      }

      rangeY = applyFlip(rangeY, flipY);
      rangeY = applyPadding(rangeY, top, bottom);

      if (zoomIdentity) {
        validateZoomFactor(zoomIdentity.ky);
        rangeY = applyZoom(rangeY, zoomIdentity.ky, zoomIdentity.y);
      }

      return { rangeX, rangeY }
    }

    function initRanges (props) {
      return {
        rangeX: [props.x1, props.x2],
        rangeY: [props.y1, props.y2]
      }
    }

    function applyFlip (range, flip) {
      return flip
        ? [range[1], range[0]]
        : range
    }

    function applyZoom (range, k, translate) {
      return [
        range[0] * k + translate,
        range[1] * k + translate
      ]
    }

    function validateZoomFactor (k) {
      if (k < 0) throw new Error('Zoom factors have to be positive')
    }

    let idCounter$2 = 0;

    function getId$2$1 () {
      return 'sc' + idCounter$2++
    }

    /**
     * Creates a Section.
     *
     * For more on how positioning works, see the {@link createRectangle} documentation.
     *
     * @param {Object} props
     * @param {*} [props.x1] A x-coordinate, or a function that returns an original x-coordinate.
     * @param {*} [props.x2] A x-coordinate, or a function that returns an original x-coordinate.
     * @param {*} [props.y1] A y-coordinate, or a function that returns an original y-coordinate.
     * @param {*} [props.y2] A y-coordinate, or a function that returns an original y-coordinate.
     * @param {function} [props.coordinates=cartesian()] Defines alternative coordinate systems. Defaults to cartesian.
     * @param {function|number[]} [props.scaleX] A d3 scaling function or an array of two numbers indicating the desired domain.
     * @param {function|number[]} [props.scaleY] A d3 scaling function or an array of two numbers indicating the desired domain.
     * @param {boolean} [props.flipX=false] Flips the coordinate system in the x-dimension.
     * @param {boolean} [props.flipY=false] Flips the coordinate system in the y-dimension.
     * @param {number|object} [props.padding=0] A number representing padding in pixels on all sides, or a {@link Padding} object.
     * @param {object} [props.zoomIdentity] A {@link ZoomIdentity} object.
     * @param {string} [props.clip='padding'] Sets the clipping mode for the section contents.
     * @param {string} [props.id] Allows providing a custom id. Mostly used for testing.
     * @param {Section} [parentSection]
     *
     * @return {Section}
     */
    function createSection (_props, parentSection) {
      if (parentSection && parentSection.type !== 'cartesian') {
        throw new Error('Cannot nest section inside other section with polar coordinates')
      }

      const props = parseSection(_props, parentSection);
      const id = props.id ? props.id : getId$2$1();

      const padding = parsePadding(props.padding);
      const zoomIdentity = parseZoomIdentity(props.zoomIdentity);
      const ranges = getRanges(props, padding);

      const bbox = clampBbox(getBbox$3(props), parentSection);
      const paddedBbox = clampBbox(getPaddedBbox(bbox, padding), parentSection);

      return props.coordinates(props, {
        id,
        padding,
        zoomIdentity,
        ranges,
        bbox,
        paddedBbox,
        clip: props.clip
      })
    }

    /**
     * A Section object created by {@link createSection} or {@link createPointSection}.
     * @typedef Section
     */

    /**
     * A ZoomIdentity object.
     * @typedef {object} ZoomIdentity
     * @property {number} [x=0] Pixel value of x-translate.
     * @property {number} [y=0] Pixel value of y-translate.
     * @property {number} [kx=1] Zoom factor in x-dimension.
     * @property {number} [ky=1] Zoom factor in y-dimension.
     */

    function parseZoomIdentity (zoomIdentity) {
      return Object.assign({ x: 0, y: 0, kx: 1, ky: 1 }, zoomIdentity)
    }

    function getBbox$3 ({ x1, x2, y1, y2 }) {
      return {
        minX: Math.min(x1, x2),
        maxX: Math.max(x1, x2),
        minY: Math.min(y1, y2),
        maxY: Math.max(y1, y2)
      }
    }

    function getPaddedBbox (
      { minX, maxX, minY, maxY },
      { left, right, top, bottom }
    ) {
      return {
        minX: minX + left,
        maxX: maxX - right,
        minY: minY + top,
        maxY: maxY - bottom
      }
    }

    function clampBbox (bbox, parentSection) {
      if (!parentSection) return bbox

      const parentBbox = parentSection.clip === 'padding'
        ? parentSection.paddedBbox
        : parentSection.bbox;

      return {
        minX: Math.max(bbox.minX, parentBbox.minX),
        maxX: Math.min(bbox.maxX, parentBbox.maxX),
        minY: Math.max(bbox.minY, parentBbox.minY),
        maxY: Math.min(bbox.maxY, parentBbox.maxY)
      }
    }

    /* node_modules/@snlab/florence/src/components/core/_Clipper.svelte generated by Svelte v3.49.0 */

    function create_fragment$e(ctx) {
    	let clipPath0;
    	let rect0;
    	let t;
    	let clipPath1;
    	let rect1;
    	let clipPath1_id_value;
    	let rect0_levels = [/*paddingClipRect*/ ctx[2]];
    	let rect0_data = {};

    	for (let i = 0; i < rect0_levels.length; i += 1) {
    		rect0_data = assign(rect0_data, rect0_levels[i]);
    	}

    	let rect1_levels = [/*outerClipRect*/ ctx[0]];
    	let rect1_data = {};

    	for (let i = 0; i < rect1_levels.length; i += 1) {
    		rect1_data = assign(rect1_data, rect1_levels[i]);
    	}

    	return {
    		c() {
    			clipPath0 = svg_element("clipPath");
    			rect0 = svg_element("rect");
    			t = space();
    			clipPath1 = svg_element("clipPath");
    			rect1 = svg_element("rect");
    			set_svg_attributes(rect0, rect0_data);
    			attr(clipPath0, "id", /*paddingClipId*/ ctx[3]);
    			set_svg_attributes(rect1, rect1_data);
    			attr(clipPath1, "id", clipPath1_id_value = `clip-${/*outerClipId*/ ctx[1]}`);
    		},
    		m(target, anchor) {
    			insert(target, clipPath0, anchor);
    			append(clipPath0, rect0);
    			insert(target, t, anchor);
    			insert(target, clipPath1, anchor);
    			append(clipPath1, rect1);
    		},
    		p(ctx, [dirty]) {
    			set_svg_attributes(rect0, rect0_data = get_spread_update(rect0_levels, [dirty & /*paddingClipRect*/ 4 && /*paddingClipRect*/ ctx[2]]));

    			if (dirty & /*paddingClipId*/ 8) {
    				attr(clipPath0, "id", /*paddingClipId*/ ctx[3]);
    			}

    			set_svg_attributes(rect1, rect1_data = get_spread_update(rect1_levels, [dirty & /*outerClipRect*/ 1 && /*outerClipRect*/ ctx[0]]));

    			if (dirty & /*outerClipId*/ 2 && clipPath1_id_value !== (clipPath1_id_value = `clip-${/*outerClipId*/ ctx[1]}`)) {
    				attr(clipPath1, "id", clipPath1_id_value);
    			}
    		},
    		i: noop$1,
    		o: noop$1,
    		d(detaching) {
    			if (detaching) detach(clipPath0);
    			if (detaching) detach(t);
    			if (detaching) detach(clipPath1);
    		}
    	};
    }

    function instance$e($$self, $$props, $$invalidate) {
    	let paddingClipId;
    	let paddingClipRect;
    	let outerClipId;
    	let outerClipRect;
    	let { section } = $$props;

    	$$self.$$set = $$props => {
    		if ('section' in $$props) $$invalidate(4, section = $$props.section);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*section*/ 16) {
    			$$invalidate(3, paddingClipId = `clip-padding-${section.id}`);
    		}

    		if ($$self.$$.dirty & /*section*/ 16) {
    			$$invalidate(2, paddingClipRect = bboxToClipRect(section.paddedBbox));
    		}

    		if ($$self.$$.dirty & /*section*/ 16) {
    			$$invalidate(1, outerClipId = `clip-outer-${section.id}`);
    		}

    		if ($$self.$$.dirty & /*section*/ 16) {
    			$$invalidate(0, outerClipRect = bboxToClipRect(section.bbox));
    		}
    	};

    	return [outerClipRect, outerClipId, paddingClipRect, paddingClipId, section];
    }

    class Clipper extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$e, create_fragment$e, safe_not_equal, { section: 4 });
    	}
    }

    function any (...args) {
      for (const arg of args) {
        if (arg !== undefined) return true
      }

      return false
    }

    function merge (obj1, obj2) {
      const merged = Object.assign(obj1, {});
      for (const key in obj2) { merged[key] = obj2[key]; }

      return merged
    }

    const TEST_ENV = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

    function testId (input) {
      if (TEST_ENV) {
        return input
      }
    }

    /* node_modules/@snlab/florence/src/components/marks/base/Mark.svelte generated by Svelte v3.49.0 */

    function create_if_block_1$5(ctx) {
    	let t;
    	let if_block1_anchor;
    	let if_block0 = /*element*/ ctx[2] === 'path' && create_if_block_3$2(ctx);
    	let if_block1 = /*element*/ ctx[2] === 'text' && create_if_block_2$4(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*element*/ ctx[2] === 'path') {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_3$2(ctx);
    					if_block0.c();
    					if_block0.m(t.parentNode, t);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*element*/ ctx[2] === 'text') {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2$4(ctx);
    					if_block1.c();
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    		}
    	};
    }

    // (234:2) {#if element === 'path'}
    function create_if_block_3$2(ctx) {
    	let path;
    	let path_clip_path_value;
    	let path_data_testid_value;

    	let path_levels = [
    		/*svgData*/ ctx[4],
    		{ class: /*className*/ ctx[1] },
    		{
    			"clip-path": path_clip_path_value = getClipPathURL(/*aesthetics*/ ctx[0], /*$section*/ ctx[3])
    		},
    		{
    			"data-testid": path_data_testid_value = testId(/*className*/ ctx[1])
    		}
    	];

    	let path_data = {};

    	for (let i = 0; i < path_levels.length; i += 1) {
    		path_data = assign(path_data, path_levels[i]);
    	}

    	return {
    		c() {
    			path = svg_element("path");
    			set_svg_attributes(path, path_data);
    		},
    		m(target, anchor) {
    			insert(target, path, anchor);
    		},
    		p(ctx, dirty) {
    			set_svg_attributes(path, path_data = get_spread_update(path_levels, [
    				dirty[0] & /*svgData*/ 16 && /*svgData*/ ctx[4],
    				dirty[0] & /*className*/ 2 && { class: /*className*/ ctx[1] },
    				dirty[0] & /*aesthetics, $section*/ 9 && path_clip_path_value !== (path_clip_path_value = getClipPathURL(/*aesthetics*/ ctx[0], /*$section*/ ctx[3])) && { "clip-path": path_clip_path_value },
    				dirty[0] & /*className*/ 2 && path_data_testid_value !== (path_data_testid_value = testId(/*className*/ ctx[1])) && { "data-testid": path_data_testid_value }
    			]));
    		},
    		d(detaching) {
    			if (detaching) detach(path);
    		}
    	};
    }

    // (243:2) {#if element === 'text'}
    function create_if_block_2$4(ctx) {
    	let text_1;
    	let t_value = /*svgData*/ ctx[4].text + "";
    	let t;
    	let text_1_clip_path_value;
    	let text_1_data_testid_value;

    	let text_1_levels = [
    		/*svgData*/ ctx[4],
    		{ text: undefined },
    		{ class: /*className*/ ctx[1] },
    		{
    			"clip-path": text_1_clip_path_value = getClipPathURL(/*aesthetics*/ ctx[0], /*$section*/ ctx[3])
    		},
    		{
    			"data-testid": text_1_data_testid_value = testId(/*className*/ ctx[1])
    		}
    	];

    	let text_1_data = {};

    	for (let i = 0; i < text_1_levels.length; i += 1) {
    		text_1_data = assign(text_1_data, text_1_levels[i]);
    	}

    	return {
    		c() {
    			text_1 = svg_element("text");
    			t = text(t_value);
    			set_svg_attributes(text_1, text_1_data);
    		},
    		m(target, anchor) {
    			insert(target, text_1, anchor);
    			append(text_1, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*svgData*/ 16 && t_value !== (t_value = /*svgData*/ ctx[4].text + "")) set_data(t, t_value);

    			set_svg_attributes(text_1, text_1_data = get_spread_update(text_1_levels, [
    				dirty[0] & /*svgData*/ 16 && /*svgData*/ ctx[4],
    				{ text: undefined },
    				dirty[0] & /*className*/ 2 && { class: /*className*/ ctx[1] },
    				dirty[0] & /*aesthetics, $section*/ 9 && text_1_clip_path_value !== (text_1_clip_path_value = getClipPathURL(/*aesthetics*/ ctx[0], /*$section*/ ctx[3])) && { "clip-path": text_1_clip_path_value },
    				dirty[0] & /*className*/ 2 && text_1_data_testid_value !== (text_1_data_testid_value = testId(/*className*/ ctx[1])) && { "data-testid": text_1_data_testid_value }
    			]));
    		},
    		d(detaching) {
    			if (detaching) detach(text_1);
    		}
    	};
    }

    // (256:0) {#if renderer === 'canvas'}
    function create_if_block$6(ctx) {
    	let t;

    	return {
    		c() {
    			t = text(/*id*/ ctx[9]);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p: noop$1,
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    function create_fragment$d(ctx) {
    	let t;
    	let if_block1_anchor;
    	let if_block0 = /*renderer*/ ctx[5] === 'svg' && create_if_block_1$5(ctx);
    	let if_block1 = /*renderer*/ ctx[5] === 'canvas' && create_if_block$6(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*renderer*/ ctx[5] === 'svg') if_block0.p(ctx, dirty);
    			if (/*renderer*/ ctx[5] === 'canvas') if_block1.p(ctx, dirty);
    		},
    		i: noop$1,
    		o: noop$1,
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    		}
    	};
    }

    let markId = 0;
    const getId$3 = () => 'm' + markId++;

    function instance$d($$self, $$props, $$invalidate) {
    	let primaryInput;
    	let isInteractiveMouse;
    	let isInteractiveTouch;
    	let isSelectable;
    	let $interactionManager;
    	let $globalBlockReindexing;
    	let $section;
    	let { positioning } = $$props;
    	let { aesthetics } = $$props;
    	let { createMark } = $$props;
    	let { parseAesthetics } = $$props;
    	let { className } = $$props;
    	let { element = 'path' } = $$props;
    	let { outputSettings = undefined } = $$props;
    	let { blockReindexing = undefined } = $$props;
    	let { onClick = undefined } = $$props;
    	let { onMousedown = undefined } = $$props;
    	let { onMouseup = undefined } = $$props;
    	let { onMouseover = undefined } = $$props;
    	let { onMouseout = undefined } = $$props;
    	let { onMousedrag = undefined } = $$props;
    	let { onTouchdown = undefined } = $$props;
    	let { onTouchup = undefined } = $$props;
    	let { onTouchover = undefined } = $$props;
    	let { onTouchout = undefined } = $$props;
    	let { onTouchdrag = undefined } = $$props;
    	let { onSelect = undefined } = $$props;
    	let { onDeselect = undefined } = $$props;

    	// Get parent contexts
    	const { renderer, marksAndLayers, dirty, globalBlockReindexing } = getContext('graphic');

    	component_subscribe($$self, globalBlockReindexing, value => $$invalidate(39, $globalBlockReindexing = value));
    	const section = getContext('section');
    	component_subscribe($$self, section, value => $$invalidate(3, $section = value));
    	const interactionManager = getContext('interactionManager');
    	component_subscribe($$self, interactionManager, value => $$invalidate(33, $interactionManager = value));
    	const id = getId$3();
    	const createSVGContext = element === 'path' ? svgStyled.path : svgStyled.text;

    	// Init
    	let mounted;

    	onMount(() => {
    		mounted = true;

    		if (renderer === 'canvas') {
    			dirty.set(true);
    		}

    		updateInteractionManagerIfNecessary();
    	});

    	const isMounted = () => mounted;
    	let mark = create();
    	marksAndLayers[id] = mark;

    	function create() {
    		let _mark = createMark(merge(positioning, aesthetics), $section, outputSettings);
    		_mark.id = id;
    		return _mark;
    	}

    	let svgContext;
    	let svgData;

    	if (renderer === 'svg') {
    		svgContext = createSVGContext();
    		mark.render(svgContext);
    		svgData = svgContext.result();
    	}

    	// Handling of updates
    	let updatePositioning = false;

    	let updateAesthetics = false;

    	function scheduleUpdatePositioning() {
    		if (isMounted()) {
    			$$invalidate(30, updatePositioning = true);
    		}
    	}

    	function scheduleUpdateAesthetics() {
    		if (isMounted()) {
    			$$invalidate(31, updateAesthetics = true);
    		}
    	}

    	function updateInteractionManagerIfNecessary() {
    		if (blockReindexing === undefined) {
    			if ($globalBlockReindexing) return;
    		} else {
    			if (blockReindexing === true) return;
    		}

    		if (isInteractiveMouse || isInteractiveTouch) {
    			removeMarkFromSpatialIndexIfNecessary();

    			if (isInteractiveMouse) {
    				const markInterface = $interactionManager.mouse().marks();
    				markInterface.loadMark(mark);
    				if (onClick) markInterface.addMarkInteraction('click', mark, onClick);
    				if (onMousedown) markInterface.addMarkInteraction('mousedown', mark, onMousedown);
    				if (onMouseup) markInterface.addMarkInteraction('mouseup', mark, onMouseup);
    				if (onMouseout) markInterface.addMarkInteraction('mouseout', mark, onMouseout);
    				if (onMouseover) markInterface.addMarkInteraction('mouseover', mark, onMouseover);
    				if (onMousedrag) markInterface.addMarkInteraction('mousedrag', mark, onMousedrag);
    			}

    			if (isInteractiveTouch) {
    				const markInterface = $interactionManager.touch().marks();
    				markInterface.loadMark(mark);
    				if (onTouchdown) markInterface.addMarkInteraction('touchdown', mark, onTouchdown);
    				if (onTouchup) markInterface.addMarkInteraction('touchup', mark, onTouchup);
    				if (onTouchover) markInterface.addMarkInteraction('touchover', mark, onTouchover);
    				if (onTouchout) markInterface.addMarkInteraction('touchout', mark, onTouchout);
    				if (onTouchdrag) markInterface.addMarkInteraction('touchdrag', mark, onTouchdrag);
    			}
    		}

    		removeMarkFromSelectIfNecessary();

    		if (isSelectable) {
    			const selectManager = $interactionManager.select();
    			selectManager.loadMark(mark, { onSelect, onDeselect });
    		}
    	}

    	function removeMarkFromSpatialIndexIfNecessary() {
    		if (primaryInput === 'mouse') {
    			const markMouseInterface = $interactionManager.mouse().marks();

    			if (markMouseInterface.markIsLoaded(mark)) {
    				markMouseInterface.removeAllMarkInteractions(mark);
    				markMouseInterface.removeMark(mark);
    			}
    		}

    		if (primaryInput === 'touch') {
    			const markTouchInterface = $interactionManager.touch().marks();

    			if (markTouchInterface.markIsLoaded(mark)) {
    				markTouchInterface.removeAllMarkInteractions(mark);
    				markTouchInterface.removeMark(mark);
    			}
    		}
    	}

    	function removeMarkFromSelectIfNecessary() {
    		const selectManager = $interactionManager.select();

    		if (selectManager.markIsLoaded(mark)) {
    			selectManager.removeMark(mark);
    		}
    	}

    	onDestroy(() => {
    		if (renderer === 'canvas') {
    			delete marksAndLayers[id];
    			dirty.set(true);
    		}
    	});

    	$$self.$$set = $$props => {
    		if ('positioning' in $$props) $$invalidate(10, positioning = $$props.positioning);
    		if ('aesthetics' in $$props) $$invalidate(0, aesthetics = $$props.aesthetics);
    		if ('createMark' in $$props) $$invalidate(11, createMark = $$props.createMark);
    		if ('parseAesthetics' in $$props) $$invalidate(12, parseAesthetics = $$props.parseAesthetics);
    		if ('className' in $$props) $$invalidate(1, className = $$props.className);
    		if ('element' in $$props) $$invalidate(2, element = $$props.element);
    		if ('outputSettings' in $$props) $$invalidate(13, outputSettings = $$props.outputSettings);
    		if ('blockReindexing' in $$props) $$invalidate(14, blockReindexing = $$props.blockReindexing);
    		if ('onClick' in $$props) $$invalidate(15, onClick = $$props.onClick);
    		if ('onMousedown' in $$props) $$invalidate(16, onMousedown = $$props.onMousedown);
    		if ('onMouseup' in $$props) $$invalidate(17, onMouseup = $$props.onMouseup);
    		if ('onMouseover' in $$props) $$invalidate(18, onMouseover = $$props.onMouseover);
    		if ('onMouseout' in $$props) $$invalidate(19, onMouseout = $$props.onMouseout);
    		if ('onMousedrag' in $$props) $$invalidate(20, onMousedrag = $$props.onMousedrag);
    		if ('onTouchdown' in $$props) $$invalidate(21, onTouchdown = $$props.onTouchdown);
    		if ('onTouchup' in $$props) $$invalidate(22, onTouchup = $$props.onTouchup);
    		if ('onTouchover' in $$props) $$invalidate(23, onTouchover = $$props.onTouchover);
    		if ('onTouchout' in $$props) $$invalidate(24, onTouchout = $$props.onTouchout);
    		if ('onTouchdrag' in $$props) $$invalidate(25, onTouchdrag = $$props.onTouchdrag);
    		if ('onSelect' in $$props) $$invalidate(26, onSelect = $$props.onSelect);
    		if ('onDeselect' in $$props) $$invalidate(27, onDeselect = $$props.onDeselect);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*positioning*/ 1024) {
    			{
    				if (positioning) {
    					scheduleUpdatePositioning();
    				}
    			}
    		}

    		if ($$self.$$.dirty[0] & /*aesthetics*/ 1) {
    			{
    				if (aesthetics) {
    					scheduleUpdateAesthetics();
    				}
    			}
    		}

    		if ($$self.$$.dirty[0] & /*$section, outputSettings*/ 8200) {
    			{
    				if ($section || outputSettings) {
    					scheduleUpdatePositioning();
    				}
    			}
    		}

    		if ($$self.$$.dirty[0] & /*updatePositioning, mark, svgContext, parseAesthetics, aesthetics*/ 1879052289 | $$self.$$.dirty[1] & /*updateAesthetics*/ 1) {
    			{
    				if (updatePositioning) {
    					$$invalidate(28, mark = create());

    					if (renderer === 'svg') {
    						$$invalidate(29, svgContext = createSVGContext());
    						mark.render(svgContext);
    						$$invalidate(4, svgData = svgContext.result());
    					}

    					if (renderer === 'canvas') {
    						marksAndLayers[id] = mark;
    						dirty.set(true);
    					}

    					updateInteractionManagerIfNecessary();
    				}

    				if (!updatePositioning && updateAesthetics) {
    					const parsedAesthetics = parseAesthetics(aesthetics);
    					const strokeWidthChanged = mark.props.strokeWidth !== parsedAesthetics.strokeWidth;
    					const clipChanged = mark.props.clip !== parsedAesthetics.clip;
    					mark.updateAesthetics(parsedAesthetics);

    					if (strokeWidthChanged || clipChanged) {
    						updateInteractionManagerIfNecessary();
    					}

    					if (renderer === 'svg') {
    						$$invalidate(29, svgContext = createSVGContext());
    						mark.render(svgContext);
    						$$invalidate(4, svgData = svgContext.result());
    					}

    					if (renderer === 'canvas') {
    						dirty.set(true);
    					}
    				}

    				$$invalidate(30, updatePositioning = false);
    				$$invalidate(31, updateAesthetics = false);
    			}
    		}

    		if ($$self.$$.dirty[1] & /*$interactionManager*/ 4) {
    			// Interactivity
    			$$invalidate(32, primaryInput = $interactionManager.getPrimaryInput());
    		}

    		if ($$self.$$.dirty[0] & /*onClick, onMousedown, onMouseup, onMouseover, onMouseout, onMousedrag*/ 2064384 | $$self.$$.dirty[1] & /*primaryInput*/ 2) {
    			isInteractiveMouse = primaryInput === 'mouse' && any(onClick, onMousedown, onMouseup, onMouseover, onMouseout, onMousedrag);
    		}

    		if ($$self.$$.dirty[0] & /*onTouchdown, onTouchup, onTouchover, onTouchout, onTouchdrag*/ 65011712 | $$self.$$.dirty[1] & /*primaryInput*/ 2) {
    			isInteractiveTouch = primaryInput === 'touch' && any(onTouchdown, onTouchup, onTouchover, onTouchout, onTouchdrag);
    		}

    		if ($$self.$$.dirty[0] & /*onSelect, onDeselect*/ 201326592) {
    			isSelectable = any(onSelect, onDeselect);
    		}
    	};

    	return [
    		aesthetics,
    		className,
    		element,
    		$section,
    		svgData,
    		renderer,
    		globalBlockReindexing,
    		section,
    		interactionManager,
    		id,
    		positioning,
    		createMark,
    		parseAesthetics,
    		outputSettings,
    		blockReindexing,
    		onClick,
    		onMousedown,
    		onMouseup,
    		onMouseover,
    		onMouseout,
    		onMousedrag,
    		onTouchdown,
    		onTouchup,
    		onTouchover,
    		onTouchout,
    		onTouchdrag,
    		onSelect,
    		onDeselect,
    		mark,
    		svgContext,
    		updatePositioning,
    		updateAesthetics,
    		primaryInput,
    		$interactionManager
    	];
    }

    class Mark extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$d,
    			create_fragment$d,
    			safe_not_equal,
    			{
    				positioning: 10,
    				aesthetics: 0,
    				createMark: 11,
    				parseAesthetics: 12,
    				className: 1,
    				element: 2,
    				outputSettings: 13,
    				blockReindexing: 14,
    				onClick: 15,
    				onMousedown: 16,
    				onMouseup: 17,
    				onMouseover: 18,
    				onMouseout: 19,
    				onMousedrag: 20,
    				onTouchdown: 21,
    				onTouchup: 22,
    				onTouchover: 23,
    				onTouchout: 24,
    				onTouchdrag: 25,
    				onSelect: 26,
    				onDeselect: 27
    			},
    			null,
    			[-1, -1]
    		);
    	}
    }

    /* node_modules/@snlab/florence/src/components/marks/rectangle/Rectangle.svelte generated by Svelte v3.49.0 */

    function create_fragment$c(ctx) {
    	let mark;
    	let current;

    	mark = new Mark({
    			props: {
    				positioning: /*positioning*/ ctx[16],
    				aesthetics: /*aesthetics*/ ctx[15],
    				createMark: createRectangle,
    				parseAesthetics: parseAestheticsRectangle,
    				className: "rectangle",
    				outputSettings: /*outputSettings*/ ctx[0],
    				blockReindexing: /*blockReindexing*/ ctx[1],
    				onClick: /*onClick*/ ctx[2],
    				onMousedown: /*onMousedown*/ ctx[3],
    				onMouseup: /*onMouseup*/ ctx[4],
    				onMouseover: /*onMouseover*/ ctx[5],
    				onMouseout: /*onMouseout*/ ctx[6],
    				onMousedrag: /*onMousedrag*/ ctx[7],
    				onTouchdown: /*onTouchdown*/ ctx[8],
    				onTouchup: /*onTouchup*/ ctx[9],
    				onTouchover: /*onTouchover*/ ctx[10],
    				onTouchout: /*onTouchout*/ ctx[11],
    				onTouchdrag: /*onTouchdrag*/ ctx[12],
    				onSelect: /*onSelect*/ ctx[13],
    				onDeselect: /*onDeselect*/ ctx[14]
    			}
    		});

    	return {
    		c() {
    			create_component(mark.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(mark, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const mark_changes = {};
    			if (dirty[0] & /*positioning*/ 65536) mark_changes.positioning = /*positioning*/ ctx[16];
    			if (dirty[0] & /*aesthetics*/ 32768) mark_changes.aesthetics = /*aesthetics*/ ctx[15];
    			if (dirty[0] & /*outputSettings*/ 1) mark_changes.outputSettings = /*outputSettings*/ ctx[0];
    			if (dirty[0] & /*blockReindexing*/ 2) mark_changes.blockReindexing = /*blockReindexing*/ ctx[1];
    			if (dirty[0] & /*onClick*/ 4) mark_changes.onClick = /*onClick*/ ctx[2];
    			if (dirty[0] & /*onMousedown*/ 8) mark_changes.onMousedown = /*onMousedown*/ ctx[3];
    			if (dirty[0] & /*onMouseup*/ 16) mark_changes.onMouseup = /*onMouseup*/ ctx[4];
    			if (dirty[0] & /*onMouseover*/ 32) mark_changes.onMouseover = /*onMouseover*/ ctx[5];
    			if (dirty[0] & /*onMouseout*/ 64) mark_changes.onMouseout = /*onMouseout*/ ctx[6];
    			if (dirty[0] & /*onMousedrag*/ 128) mark_changes.onMousedrag = /*onMousedrag*/ ctx[7];
    			if (dirty[0] & /*onTouchdown*/ 256) mark_changes.onTouchdown = /*onTouchdown*/ ctx[8];
    			if (dirty[0] & /*onTouchup*/ 512) mark_changes.onTouchup = /*onTouchup*/ ctx[9];
    			if (dirty[0] & /*onTouchover*/ 1024) mark_changes.onTouchover = /*onTouchover*/ ctx[10];
    			if (dirty[0] & /*onTouchout*/ 2048) mark_changes.onTouchout = /*onTouchout*/ ctx[11];
    			if (dirty[0] & /*onTouchdrag*/ 4096) mark_changes.onTouchdrag = /*onTouchdrag*/ ctx[12];
    			if (dirty[0] & /*onSelect*/ 8192) mark_changes.onSelect = /*onSelect*/ ctx[13];
    			if (dirty[0] & /*onDeselect*/ 16384) mark_changes.onDeselect = /*onDeselect*/ ctx[14];
    			mark.$set(mark_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(mark.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(mark.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(mark, detaching);
    		}
    	};
    }

    function instance$c($$self, $$props, $$invalidate) {
    	let positioning;
    	let aesthetics;
    	let { x1 = undefined } = $$props;
    	let { x2 = undefined } = $$props;
    	let { y1 = undefined } = $$props;
    	let { y2 = undefined } = $$props;
    	let { fill = undefined } = $$props;
    	let { stroke = undefined } = $$props;
    	let { strokeWidth = undefined } = $$props;
    	let { strokeOpacity = undefined } = $$props;
    	let { fillOpacity = undefined } = $$props;
    	let { opacity = undefined } = $$props;
    	let { lineCap = undefined } = $$props;
    	let { lineJoin = undefined } = $$props;
    	let { miterLimit = undefined } = $$props;
    	let { dashArray = undefined } = $$props;
    	let { dashOffset = undefined } = $$props;
    	let { outputSettings = undefined } = $$props;
    	let { clip = undefined } = $$props;
    	let { blockReindexing = undefined } = $$props;
    	let { onClick = undefined } = $$props;
    	let { onMousedown = undefined } = $$props;
    	let { onMouseup = undefined } = $$props;
    	let { onMouseover = undefined } = $$props;
    	let { onMouseout = undefined } = $$props;
    	let { onMousedrag = undefined } = $$props;
    	let { onTouchdown = undefined } = $$props;
    	let { onTouchup = undefined } = $$props;
    	let { onTouchover = undefined } = $$props;
    	let { onTouchout = undefined } = $$props;
    	let { onTouchdrag = undefined } = $$props;
    	let { onSelect = undefined } = $$props;
    	let { onDeselect = undefined } = $$props;

    	$$self.$$set = $$props => {
    		if ('x1' in $$props) $$invalidate(17, x1 = $$props.x1);
    		if ('x2' in $$props) $$invalidate(18, x2 = $$props.x2);
    		if ('y1' in $$props) $$invalidate(19, y1 = $$props.y1);
    		if ('y2' in $$props) $$invalidate(20, y2 = $$props.y2);
    		if ('fill' in $$props) $$invalidate(21, fill = $$props.fill);
    		if ('stroke' in $$props) $$invalidate(22, stroke = $$props.stroke);
    		if ('strokeWidth' in $$props) $$invalidate(23, strokeWidth = $$props.strokeWidth);
    		if ('strokeOpacity' in $$props) $$invalidate(24, strokeOpacity = $$props.strokeOpacity);
    		if ('fillOpacity' in $$props) $$invalidate(25, fillOpacity = $$props.fillOpacity);
    		if ('opacity' in $$props) $$invalidate(26, opacity = $$props.opacity);
    		if ('lineCap' in $$props) $$invalidate(27, lineCap = $$props.lineCap);
    		if ('lineJoin' in $$props) $$invalidate(28, lineJoin = $$props.lineJoin);
    		if ('miterLimit' in $$props) $$invalidate(29, miterLimit = $$props.miterLimit);
    		if ('dashArray' in $$props) $$invalidate(30, dashArray = $$props.dashArray);
    		if ('dashOffset' in $$props) $$invalidate(31, dashOffset = $$props.dashOffset);
    		if ('outputSettings' in $$props) $$invalidate(0, outputSettings = $$props.outputSettings);
    		if ('clip' in $$props) $$invalidate(32, clip = $$props.clip);
    		if ('blockReindexing' in $$props) $$invalidate(1, blockReindexing = $$props.blockReindexing);
    		if ('onClick' in $$props) $$invalidate(2, onClick = $$props.onClick);
    		if ('onMousedown' in $$props) $$invalidate(3, onMousedown = $$props.onMousedown);
    		if ('onMouseup' in $$props) $$invalidate(4, onMouseup = $$props.onMouseup);
    		if ('onMouseover' in $$props) $$invalidate(5, onMouseover = $$props.onMouseover);
    		if ('onMouseout' in $$props) $$invalidate(6, onMouseout = $$props.onMouseout);
    		if ('onMousedrag' in $$props) $$invalidate(7, onMousedrag = $$props.onMousedrag);
    		if ('onTouchdown' in $$props) $$invalidate(8, onTouchdown = $$props.onTouchdown);
    		if ('onTouchup' in $$props) $$invalidate(9, onTouchup = $$props.onTouchup);
    		if ('onTouchover' in $$props) $$invalidate(10, onTouchover = $$props.onTouchover);
    		if ('onTouchout' in $$props) $$invalidate(11, onTouchout = $$props.onTouchout);
    		if ('onTouchdrag' in $$props) $$invalidate(12, onTouchdrag = $$props.onTouchdrag);
    		if ('onSelect' in $$props) $$invalidate(13, onSelect = $$props.onSelect);
    		if ('onDeselect' in $$props) $$invalidate(14, onDeselect = $$props.onDeselect);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*x1, x2, y1, y2*/ 1966080) {
    			$$invalidate(16, positioning = { x1, x2, y1, y2 });
    		}

    		if ($$self.$$.dirty[0] & /*fill, stroke, strokeWidth, strokeOpacity, fillOpacity, opacity, lineCap, lineJoin, miterLimit, dashArray*/ 2145386496 | $$self.$$.dirty[1] & /*dashOffset, clip*/ 3) {
    			$$invalidate(15, aesthetics = {
    				fill,
    				stroke,
    				strokeWidth,
    				strokeOpacity,
    				fillOpacity,
    				opacity,
    				lineCap,
    				lineJoin,
    				miterLimit,
    				dashArray,
    				dashOffset,
    				clip
    			});
    		}
    	};

    	return [
    		outputSettings,
    		blockReindexing,
    		onClick,
    		onMousedown,
    		onMouseup,
    		onMouseover,
    		onMouseout,
    		onMousedrag,
    		onTouchdown,
    		onTouchup,
    		onTouchover,
    		onTouchout,
    		onTouchdrag,
    		onSelect,
    		onDeselect,
    		aesthetics,
    		positioning,
    		x1,
    		x2,
    		y1,
    		y2,
    		fill,
    		stroke,
    		strokeWidth,
    		strokeOpacity,
    		fillOpacity,
    		opacity,
    		lineCap,
    		lineJoin,
    		miterLimit,
    		dashArray,
    		dashOffset,
    		clip
    	];
    }

    class Rectangle extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$c,
    			create_fragment$c,
    			safe_not_equal,
    			{
    				x1: 17,
    				x2: 18,
    				y1: 19,
    				y2: 20,
    				fill: 21,
    				stroke: 22,
    				strokeWidth: 23,
    				strokeOpacity: 24,
    				fillOpacity: 25,
    				opacity: 26,
    				lineCap: 27,
    				lineJoin: 28,
    				miterLimit: 29,
    				dashArray: 30,
    				dashOffset: 31,
    				outputSettings: 0,
    				clip: 32,
    				blockReindexing: 1,
    				onClick: 2,
    				onMousedown: 3,
    				onMouseup: 4,
    				onMouseover: 5,
    				onMouseout: 6,
    				onMousedrag: 7,
    				onTouchdown: 8,
    				onTouchup: 9,
    				onTouchover: 10,
    				onTouchout: 11,
    				onTouchdrag: 12,
    				onSelect: 13,
    				onDeselect: 14
    			},
    			null,
    			[-1, -1]
    		);
    	}
    }

    /* node_modules/@snlab/florence/src/components/core/_BaseSection.svelte generated by Svelte v3.49.0 */

    function create_if_block_2$3(ctx) {
    	let clipper;
    	let t0;
    	let t1;
    	let g;
    	let current;
    	clipper = new Clipper({ props: { section: /*section*/ ctx[1] } });
    	let if_block = /*backgroundColor*/ ctx[0] && create_if_block_3$1(ctx);
    	const default_slot_template = /*#slots*/ ctx[23].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[22], null);

    	return {
    		c() {
    			create_component(clipper.$$.fragment);
    			t0 = space();
    			if (if_block) if_block.c();
    			t1 = space();
    			g = svg_element("g");
    			if (default_slot) default_slot.c();
    			attr(g, "class", "section");
    		},
    		m(target, anchor) {
    			mount_component(clipper, target, anchor);
    			insert(target, t0, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, t1, anchor);
    			insert(target, g, anchor);

    			if (default_slot) {
    				default_slot.m(g, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			const clipper_changes = {};
    			if (dirty & /*section*/ 2) clipper_changes.section = /*section*/ ctx[1];
    			clipper.$set(clipper_changes);

    			if (/*backgroundColor*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*backgroundColor*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_3$1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(t1.parentNode, t1);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 4194304)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[22],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[22])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[22], dirty, null),
    						null
    					);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(clipper.$$.fragment, local);
    			transition_in(if_block);
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(clipper.$$.fragment, local);
    			transition_out(if_block);
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(clipper, detaching);
    			if (detaching) detach(t0);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(t1);
    			if (detaching) detach(g);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (108:2) {#if backgroundColor}
    function create_if_block_3$1(ctx) {
    	let rectangle;
    	let current;

    	rectangle = new Rectangle({
    			props: { fill: /*backgroundColor*/ ctx[0] }
    		});

    	return {
    		c() {
    			create_component(rectangle.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(rectangle, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const rectangle_changes = {};
    			if (dirty & /*backgroundColor*/ 1) rectangle_changes.fill = /*backgroundColor*/ ctx[0];
    			rectangle.$set(rectangle_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(rectangle.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(rectangle.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(rectangle, detaching);
    		}
    	};
    }

    // (117:0) {#if renderer === 'canvas'}
    function create_if_block$5(ctx) {
    	let t;
    	let current;
    	let if_block = /*backgroundColor*/ ctx[0] && create_if_block_1$4(ctx);
    	const default_slot_template = /*#slots*/ ctx[23].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[22], null);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			t = space();
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, t, anchor);

    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*backgroundColor*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*backgroundColor*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_1$4(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(t.parentNode, t);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 4194304)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[22],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[22])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[22], dirty, null),
    						null
    					);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(t);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (118:2) {#if backgroundColor}
    function create_if_block_1$4(ctx) {
    	let rectangle;
    	let current;

    	rectangle = new Rectangle({
    			props: { fill: /*backgroundColor*/ ctx[0] }
    		});

    	return {
    		c() {
    			create_component(rectangle.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(rectangle, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const rectangle_changes = {};
    			if (dirty & /*backgroundColor*/ 1) rectangle_changes.fill = /*backgroundColor*/ ctx[0];
    			rectangle.$set(rectangle_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(rectangle.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(rectangle.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(rectangle, detaching);
    		}
    	};
    }

    function create_fragment$b(ctx) {
    	let t;
    	let if_block1_anchor;
    	let current;
    	let if_block0 = /*renderer*/ ctx[2] === 'svg' && create_if_block_2$3(ctx);
    	let if_block1 = /*renderer*/ ctx[2] === 'canvas' && create_if_block$5(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (/*renderer*/ ctx[2] === 'svg') if_block0.p(ctx, dirty);
    			if (/*renderer*/ ctx[2] === 'canvas') if_block1.p(ctx, dirty);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    		}
    	};
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let $parentSection;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { props } = $$props;
    	let { id } = $$props;
    	let { createFunction } = $$props;
    	let { backgroundColor = undefined } = $$props;
    	let { onClick = undefined } = $$props;
    	let { onWheel = undefined } = $$props;
    	let { onMousedown = undefined } = $$props;
    	let { onMouseup = undefined } = $$props;
    	let { onMouseover = undefined } = $$props;
    	let { onMouseout = undefined } = $$props;
    	let { onMousemove = undefined } = $$props;
    	let { onPinch = undefined } = $$props;
    	let { onTouchdown = undefined } = $$props;
    	let { onTouchmove = undefined } = $$props;
    	let { onTouchup = undefined } = $$props;
    	let { onTouchover = undefined } = $$props;
    	let { onTouchout = undefined } = $$props;

    	// Get parent contexts
    	const { renderer } = getContext('graphic');

    	const parentSection = getContext('section');
    	component_subscribe($$self, parentSection, value => $$invalidate(21, $parentSection = value));
    	const eventManager = getContext('eventManager');

    	// Initiate child contexts
    	const sectionContext = writable();

    	const interactionManagerContext = writable();
    	setContext('section', sectionContext);
    	setContext('interactionManager', interactionManagerContext);

    	// Section data
    	let section;

    	// Interactivity
    	const interactionManager = new InteractionManager();

    	interactionManager.setId(id);
    	interactionManager.linkEventManager(eventManager);

    	function removeSectionInteractionsIfNecessary() {
    		if (interactionManager.getPrimaryInput() === 'mouse') {
    			const sectionInterface = interactionManager.mouse().section();
    			sectionInterface.removeAllInteractions();
    			if (onWheel) sectionInterface.addInteraction('wheel', onWheel);
    			if (onClick) sectionInterface.addInteraction('click', onClick);
    			if (onMousedown) sectionInterface.addInteraction('mousedown', onMousedown);
    			if (onMouseup) sectionInterface.addInteraction('mouseup', onMouseup);
    			if (onMouseover) sectionInterface.addInteraction('mouseover', onMouseover);
    			if (onMouseout) sectionInterface.addInteraction('mouseout', onMouseout);
    			if (onMousemove) sectionInterface.addInteraction('mousemove', onMousemove);
    		}

    		if (interactionManager.getPrimaryInput() === 'touch') {
    			const sectionInterface = interactionManager.touch().section();
    			sectionInterface.removeAllInteractions();
    			if (onTouchdown) sectionInterface.addInteraction('touchdown', onTouchdown);
    			if (onTouchmove) sectionInterface.addInteraction('touchmove', onTouchmove);
    			if (onTouchup) sectionInterface.addInteraction('touchup', onTouchup);
    			if (onTouchover) sectionInterface.addInteraction('touchover', onTouchover);
    			if (onTouchout) sectionInterface.addInteraction('touchout', onTouchout);
    			if (onPinch) sectionInterface.addInteraction('pinch', onPinch);
    		}
    	}

    	const getSM = () => interactionManager.select();

    	$$self.$$set = $$props => {
    		if ('props' in $$props) $$invalidate(4, props = $$props.props);
    		if ('id' in $$props) $$invalidate(5, id = $$props.id);
    		if ('createFunction' in $$props) $$invalidate(6, createFunction = $$props.createFunction);
    		if ('backgroundColor' in $$props) $$invalidate(0, backgroundColor = $$props.backgroundColor);
    		if ('onClick' in $$props) $$invalidate(7, onClick = $$props.onClick);
    		if ('onWheel' in $$props) $$invalidate(8, onWheel = $$props.onWheel);
    		if ('onMousedown' in $$props) $$invalidate(9, onMousedown = $$props.onMousedown);
    		if ('onMouseup' in $$props) $$invalidate(10, onMouseup = $$props.onMouseup);
    		if ('onMouseover' in $$props) $$invalidate(11, onMouseover = $$props.onMouseover);
    		if ('onMouseout' in $$props) $$invalidate(12, onMouseout = $$props.onMouseout);
    		if ('onMousemove' in $$props) $$invalidate(13, onMousemove = $$props.onMousemove);
    		if ('onPinch' in $$props) $$invalidate(14, onPinch = $$props.onPinch);
    		if ('onTouchdown' in $$props) $$invalidate(15, onTouchdown = $$props.onTouchdown);
    		if ('onTouchmove' in $$props) $$invalidate(16, onTouchmove = $$props.onTouchmove);
    		if ('onTouchup' in $$props) $$invalidate(17, onTouchup = $$props.onTouchup);
    		if ('onTouchover' in $$props) $$invalidate(18, onTouchover = $$props.onTouchover);
    		if ('onTouchout' in $$props) $$invalidate(19, onTouchout = $$props.onTouchout);
    		if ('$$scope' in $$props) $$invalidate(22, $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*createFunction, props, $parentSection*/ 2097232) {
    			{
    				$$invalidate(1, section = createFunction(props, $parentSection));
    			}
    		}

    		if ($$self.$$.dirty & /*section*/ 2) {
    			{
    				interactionManager.loadSection(section);
    			}
    		}

    		if ($$self.$$.dirty & /*onWheel, onClick, onMousedown, onMouseup, onMouseover, onMouseout, onTouchdown, onTouchmove, onTouchup, onTouchover, onTouchout, onPinch*/ 1040256) {
    			{
    				removeSectionInteractionsIfNecessary();
    			}
    		}

    		if ($$self.$$.dirty & /*section*/ 2) {
    			// Expose contexts
    			{
    				sectionContext.set(section);
    			}
    		}
    	};

    	{
    		interactionManagerContext.set(interactionManager);
    	}

    	return [
    		backgroundColor,
    		section,
    		renderer,
    		parentSection,
    		props,
    		id,
    		createFunction,
    		onClick,
    		onWheel,
    		onMousedown,
    		onMouseup,
    		onMouseover,
    		onMouseout,
    		onMousemove,
    		onPinch,
    		onTouchdown,
    		onTouchmove,
    		onTouchup,
    		onTouchover,
    		onTouchout,
    		getSM,
    		$parentSection,
    		$$scope,
    		slots
    	];
    }

    class BaseSection extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$b, create_fragment$b, safe_not_equal, {
    			props: 4,
    			id: 5,
    			createFunction: 6,
    			backgroundColor: 0,
    			onClick: 7,
    			onWheel: 8,
    			onMousedown: 9,
    			onMouseup: 10,
    			onMouseover: 11,
    			onMouseout: 12,
    			onMousemove: 13,
    			onPinch: 14,
    			onTouchdown: 15,
    			onTouchmove: 16,
    			onTouchup: 17,
    			onTouchover: 18,
    			onTouchout: 19,
    			getSM: 20
    		});
    	}

    	get getSM() {
    		return this.$$.ctx[20];
    	}
    }

    /* node_modules/@snlab/florence/src/components/core/section/Section.svelte generated by Svelte v3.49.0 */

    function create_default_slot$2(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[38].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[40], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty[1] & /*$$scope*/ 512)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[40],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[40])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[40], dirty, null),
    						null
    					);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$a(ctx) {
    	let basesection;
    	let current;

    	let basesection_props = {
    		props: /*props*/ ctx[15],
    		backgroundColor: /*backgroundColor*/ ctx[0],
    		id: /*id*/ ctx[16],
    		createFunction: createSection,
    		onClick: /*onClick*/ ctx[1],
    		onWheel: /*onWheel*/ ctx[2],
    		onMousedown: /*onMousedown*/ ctx[3],
    		onMouseup: /*onMouseup*/ ctx[4],
    		onMouseover: /*onMouseover*/ ctx[5],
    		onMouseout: /*onMouseout*/ ctx[6],
    		onMousemove: /*onMousemove*/ ctx[7],
    		onPinch: /*onPinch*/ ctx[8],
    		onTouchdown: /*onTouchdown*/ ctx[9],
    		onTouchmove: /*onTouchmove*/ ctx[10],
    		onTouchup: /*onTouchup*/ ctx[11],
    		onTouchover: /*onTouchover*/ ctx[12],
    		onTouchout: /*onTouchout*/ ctx[13],
    		$$slots: { default: [create_default_slot$2] },
    		$$scope: { ctx }
    	};

    	basesection = new BaseSection({ props: basesection_props });
    	/*basesection_binding*/ ctx[39](basesection);

    	return {
    		c() {
    			create_component(basesection.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(basesection, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const basesection_changes = {};
    			if (dirty[0] & /*props*/ 32768) basesection_changes.props = /*props*/ ctx[15];
    			if (dirty[0] & /*backgroundColor*/ 1) basesection_changes.backgroundColor = /*backgroundColor*/ ctx[0];
    			if (dirty[0] & /*onClick*/ 2) basesection_changes.onClick = /*onClick*/ ctx[1];
    			if (dirty[0] & /*onWheel*/ 4) basesection_changes.onWheel = /*onWheel*/ ctx[2];
    			if (dirty[0] & /*onMousedown*/ 8) basesection_changes.onMousedown = /*onMousedown*/ ctx[3];
    			if (dirty[0] & /*onMouseup*/ 16) basesection_changes.onMouseup = /*onMouseup*/ ctx[4];
    			if (dirty[0] & /*onMouseover*/ 32) basesection_changes.onMouseover = /*onMouseover*/ ctx[5];
    			if (dirty[0] & /*onMouseout*/ 64) basesection_changes.onMouseout = /*onMouseout*/ ctx[6];
    			if (dirty[0] & /*onMousemove*/ 128) basesection_changes.onMousemove = /*onMousemove*/ ctx[7];
    			if (dirty[0] & /*onPinch*/ 256) basesection_changes.onPinch = /*onPinch*/ ctx[8];
    			if (dirty[0] & /*onTouchdown*/ 512) basesection_changes.onTouchdown = /*onTouchdown*/ ctx[9];
    			if (dirty[0] & /*onTouchmove*/ 1024) basesection_changes.onTouchmove = /*onTouchmove*/ ctx[10];
    			if (dirty[0] & /*onTouchup*/ 2048) basesection_changes.onTouchup = /*onTouchup*/ ctx[11];
    			if (dirty[0] & /*onTouchover*/ 4096) basesection_changes.onTouchover = /*onTouchover*/ ctx[12];
    			if (dirty[0] & /*onTouchout*/ 8192) basesection_changes.onTouchout = /*onTouchout*/ ctx[13];

    			if (dirty[1] & /*$$scope*/ 512) {
    				basesection_changes.$$scope = { dirty, ctx };
    			}

    			basesection.$set(basesection_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(basesection.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(basesection.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			/*basesection_binding*/ ctx[39](null);
    			destroy_component(basesection, detaching);
    		}
    	};
    }

    let idCounter$1 = 0;

    function getId$2() {
    	return 'sc' + idCounter$1++;
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let props;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	const id = getId$2();
    	let { x1 = undefined } = $$props;
    	let { x2 = undefined } = $$props;
    	let { y1 = undefined } = $$props;
    	let { y2 = undefined } = $$props;
    	let { backgroundColor = undefined } = $$props;
    	let { coordinates = undefined } = $$props;
    	let { scaleX = undefined } = $$props;
    	let { scaleY = undefined } = $$props;
    	let { flipX = false } = $$props;
    	let { flipY = false } = $$props;
    	let { padding = 0 } = $$props;
    	let { zoomIdentity = undefined } = $$props;
    	let { onClick = undefined } = $$props;
    	let { onWheel = undefined } = $$props;
    	let { onMousedown = undefined } = $$props;
    	let { onMouseup = undefined } = $$props;
    	let { onMouseover = undefined } = $$props;
    	let { onMouseout = undefined } = $$props;
    	let { onMousemove = undefined } = $$props;
    	let { onPinch = undefined } = $$props;
    	let { onTouchdown = undefined } = $$props;
    	let { onTouchmove = undefined } = $$props;
    	let { onTouchup = undefined } = $$props;
    	let { onTouchover = undefined } = $$props;
    	let { onTouchout = undefined } = $$props;
    	let { clip = 'padding' } = $$props;
    	let node;
    	const getSM = () => node.getSM();
    	const selectRectangle = rect => node.getSM().selectRectangle(rect);
    	const updateSelectRectangle = rect => node.getSM().updateSelectRectangle(rect);
    	const resetSelectRectangle = () => node.getSM().resetSelectRectangle();
    	const startSelectPolygon = c => node.getSM().startSelectPolygon(c);
    	const addPointToSelectPolygon = c => node.getSM().addPointToSelectPolygon(c);
    	const moveSelectPolygon = delta => node.getSM().moveSelectPolygon(delta);
    	const getSelectPolygon = () => node.getSM().getSelectPolygon();
    	const resetSelectPolygon = () => node.getSM().resetSelectPolygon();

    	function basesection_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			node = $$value;
    			$$invalidate(14, node);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('x1' in $$props) $$invalidate(17, x1 = $$props.x1);
    		if ('x2' in $$props) $$invalidate(18, x2 = $$props.x2);
    		if ('y1' in $$props) $$invalidate(19, y1 = $$props.y1);
    		if ('y2' in $$props) $$invalidate(20, y2 = $$props.y2);
    		if ('backgroundColor' in $$props) $$invalidate(0, backgroundColor = $$props.backgroundColor);
    		if ('coordinates' in $$props) $$invalidate(21, coordinates = $$props.coordinates);
    		if ('scaleX' in $$props) $$invalidate(22, scaleX = $$props.scaleX);
    		if ('scaleY' in $$props) $$invalidate(23, scaleY = $$props.scaleY);
    		if ('flipX' in $$props) $$invalidate(24, flipX = $$props.flipX);
    		if ('flipY' in $$props) $$invalidate(25, flipY = $$props.flipY);
    		if ('padding' in $$props) $$invalidate(26, padding = $$props.padding);
    		if ('zoomIdentity' in $$props) $$invalidate(27, zoomIdentity = $$props.zoomIdentity);
    		if ('onClick' in $$props) $$invalidate(1, onClick = $$props.onClick);
    		if ('onWheel' in $$props) $$invalidate(2, onWheel = $$props.onWheel);
    		if ('onMousedown' in $$props) $$invalidate(3, onMousedown = $$props.onMousedown);
    		if ('onMouseup' in $$props) $$invalidate(4, onMouseup = $$props.onMouseup);
    		if ('onMouseover' in $$props) $$invalidate(5, onMouseover = $$props.onMouseover);
    		if ('onMouseout' in $$props) $$invalidate(6, onMouseout = $$props.onMouseout);
    		if ('onMousemove' in $$props) $$invalidate(7, onMousemove = $$props.onMousemove);
    		if ('onPinch' in $$props) $$invalidate(8, onPinch = $$props.onPinch);
    		if ('onTouchdown' in $$props) $$invalidate(9, onTouchdown = $$props.onTouchdown);
    		if ('onTouchmove' in $$props) $$invalidate(10, onTouchmove = $$props.onTouchmove);
    		if ('onTouchup' in $$props) $$invalidate(11, onTouchup = $$props.onTouchup);
    		if ('onTouchover' in $$props) $$invalidate(12, onTouchover = $$props.onTouchover);
    		if ('onTouchout' in $$props) $$invalidate(13, onTouchout = $$props.onTouchout);
    		if ('clip' in $$props) $$invalidate(28, clip = $$props.clip);
    		if ('$$scope' in $$props) $$invalidate(40, $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*x1, x2, y1, y2, coordinates, scaleX, scaleY, flipX, flipY, padding, zoomIdentity, clip*/ 536739840) {
    			$$invalidate(15, props = {
    				x1,
    				x2,
    				y1,
    				y2,
    				coordinates,
    				scaleX,
    				scaleY,
    				flipX,
    				flipY,
    				padding,
    				zoomIdentity,
    				clip
    			});
    		}
    	};

    	return [
    		backgroundColor,
    		onClick,
    		onWheel,
    		onMousedown,
    		onMouseup,
    		onMouseover,
    		onMouseout,
    		onMousemove,
    		onPinch,
    		onTouchdown,
    		onTouchmove,
    		onTouchup,
    		onTouchover,
    		onTouchout,
    		node,
    		props,
    		id,
    		x1,
    		x2,
    		y1,
    		y2,
    		coordinates,
    		scaleX,
    		scaleY,
    		flipX,
    		flipY,
    		padding,
    		zoomIdentity,
    		clip,
    		getSM,
    		selectRectangle,
    		updateSelectRectangle,
    		resetSelectRectangle,
    		startSelectPolygon,
    		addPointToSelectPolygon,
    		moveSelectPolygon,
    		getSelectPolygon,
    		resetSelectPolygon,
    		slots,
    		basesection_binding,
    		$$scope
    	];
    }

    class Section extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$a,
    			create_fragment$a,
    			safe_not_equal,
    			{
    				x1: 17,
    				x2: 18,
    				y1: 19,
    				y2: 20,
    				backgroundColor: 0,
    				coordinates: 21,
    				scaleX: 22,
    				scaleY: 23,
    				flipX: 24,
    				flipY: 25,
    				padding: 26,
    				zoomIdentity: 27,
    				onClick: 1,
    				onWheel: 2,
    				onMousedown: 3,
    				onMouseup: 4,
    				onMouseover: 5,
    				onMouseout: 6,
    				onMousemove: 7,
    				onPinch: 8,
    				onTouchdown: 9,
    				onTouchmove: 10,
    				onTouchup: 11,
    				onTouchover: 12,
    				onTouchout: 13,
    				clip: 28,
    				getSM: 29,
    				selectRectangle: 30,
    				updateSelectRectangle: 31,
    				resetSelectRectangle: 32,
    				startSelectPolygon: 33,
    				addPointToSelectPolygon: 34,
    				moveSelectPolygon: 35,
    				getSelectPolygon: 36,
    				resetSelectPolygon: 37
    			},
    			null,
    			[-1, -1]
    		);
    	}

    	get getSM() {
    		return this.$$.ctx[29];
    	}

    	get selectRectangle() {
    		return this.$$.ctx[30];
    	}

    	get updateSelectRectangle() {
    		return this.$$.ctx[31];
    	}

    	get resetSelectRectangle() {
    		return this.$$.ctx[32];
    	}

    	get startSelectPolygon() {
    		return this.$$.ctx[33];
    	}

    	get addPointToSelectPolygon() {
    		return this.$$.ctx[34];
    	}

    	get moveSelectPolygon() {
    		return this.$$.ctx[35];
    	}

    	get getSelectPolygon() {
    		return this.$$.ctx[36];
    	}

    	get resetSelectPolygon() {
    		return this.$$.ctx[37];
    	}
    }

    /* node_modules/@snlab/florence/src/components/core/graphic/Graphic.svelte generated by Svelte v3.49.0 */

    function create_if_block_1$3(ctx) {
    	let svg;
    	let section;
    	let current;

    	let section_props = {
    		x1: 0,
    		x2: /*width*/ ctx[0],
    		y1: 0,
    		y2: /*height*/ ctx[1],
    		backgroundColor: /*backgroundColor*/ ctx[2],
    		coordinates: /*coordinates*/ ctx[3],
    		scaleX: /*scaleX*/ ctx[4],
    		scaleY: /*scaleY*/ ctx[5],
    		flipX: /*flipX*/ ctx[6],
    		flipY: /*flipY*/ ctx[7],
    		padding: /*padding*/ ctx[8],
    		zoomIdentity: /*zoomIdentity*/ ctx[9],
    		onClick: /*onClick*/ ctx[10],
    		onWheel: /*onWheel*/ ctx[11],
    		onMousedown: /*onMousedown*/ ctx[12],
    		onMouseup: /*onMouseup*/ ctx[13],
    		onMouseover: /*onMouseover*/ ctx[14],
    		onMouseout: /*onMouseout*/ ctx[15],
    		onMousemove: /*onMousemove*/ ctx[16],
    		onPinch: /*onPinch*/ ctx[17],
    		onTouchdown: /*onTouchdown*/ ctx[18],
    		onTouchmove: /*onTouchmove*/ ctx[19],
    		onTouchup: /*onTouchup*/ ctx[20],
    		onTouchover: /*onTouchover*/ ctx[21],
    		onTouchout: /*onTouchout*/ ctx[22],
    		clip: /*clip*/ ctx[23],
    		$$slots: { default: [create_default_slot_1$1] },
    		$$scope: { ctx }
    	};

    	section = new Section({ props: section_props });
    	/*section_binding*/ ctx[41](section);

    	return {
    		c() {
    			svg = svg_element("svg");
    			create_component(section.$$.fragment);
    			attr(svg, "id", /*id*/ ctx[27]);
    			attr(svg, "width", /*width*/ ctx[0]);
    			attr(svg, "height", /*height*/ ctx[1]);
    			attr(svg, "data-testid", testId('root'));
    		},
    		m(target, anchor) {
    			insert(target, svg, anchor);
    			mount_component(section, svg, null);
    			/*svg_binding*/ ctx[42](svg);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const section_changes = {};
    			if (dirty[0] & /*width*/ 1) section_changes.x2 = /*width*/ ctx[0];
    			if (dirty[0] & /*height*/ 2) section_changes.y2 = /*height*/ ctx[1];
    			if (dirty[0] & /*backgroundColor*/ 4) section_changes.backgroundColor = /*backgroundColor*/ ctx[2];
    			if (dirty[0] & /*coordinates*/ 8) section_changes.coordinates = /*coordinates*/ ctx[3];
    			if (dirty[0] & /*scaleX*/ 16) section_changes.scaleX = /*scaleX*/ ctx[4];
    			if (dirty[0] & /*scaleY*/ 32) section_changes.scaleY = /*scaleY*/ ctx[5];
    			if (dirty[0] & /*flipX*/ 64) section_changes.flipX = /*flipX*/ ctx[6];
    			if (dirty[0] & /*flipY*/ 128) section_changes.flipY = /*flipY*/ ctx[7];
    			if (dirty[0] & /*padding*/ 256) section_changes.padding = /*padding*/ ctx[8];
    			if (dirty[0] & /*zoomIdentity*/ 512) section_changes.zoomIdentity = /*zoomIdentity*/ ctx[9];
    			if (dirty[0] & /*onClick*/ 1024) section_changes.onClick = /*onClick*/ ctx[10];
    			if (dirty[0] & /*onWheel*/ 2048) section_changes.onWheel = /*onWheel*/ ctx[11];
    			if (dirty[0] & /*onMousedown*/ 4096) section_changes.onMousedown = /*onMousedown*/ ctx[12];
    			if (dirty[0] & /*onMouseup*/ 8192) section_changes.onMouseup = /*onMouseup*/ ctx[13];
    			if (dirty[0] & /*onMouseover*/ 16384) section_changes.onMouseover = /*onMouseover*/ ctx[14];
    			if (dirty[0] & /*onMouseout*/ 32768) section_changes.onMouseout = /*onMouseout*/ ctx[15];
    			if (dirty[0] & /*onMousemove*/ 65536) section_changes.onMousemove = /*onMousemove*/ ctx[16];
    			if (dirty[0] & /*onPinch*/ 131072) section_changes.onPinch = /*onPinch*/ ctx[17];
    			if (dirty[0] & /*onTouchdown*/ 262144) section_changes.onTouchdown = /*onTouchdown*/ ctx[18];
    			if (dirty[0] & /*onTouchmove*/ 524288) section_changes.onTouchmove = /*onTouchmove*/ ctx[19];
    			if (dirty[0] & /*onTouchup*/ 1048576) section_changes.onTouchup = /*onTouchup*/ ctx[20];
    			if (dirty[0] & /*onTouchover*/ 2097152) section_changes.onTouchover = /*onTouchover*/ ctx[21];
    			if (dirty[0] & /*onTouchout*/ 4194304) section_changes.onTouchout = /*onTouchout*/ ctx[22];
    			if (dirty[0] & /*clip*/ 8388608) section_changes.clip = /*clip*/ ctx[23];

    			if (dirty[1] & /*$$scope*/ 16384) {
    				section_changes.$$scope = { dirty, ctx };
    			}

    			section.$set(section_changes);

    			if (!current || dirty[0] & /*width*/ 1) {
    				attr(svg, "width", /*width*/ ctx[0]);
    			}

    			if (!current || dirty[0] & /*height*/ 2) {
    				attr(svg, "height", /*height*/ ctx[1]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(section.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(section.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(svg);
    			/*section_binding*/ ctx[41](null);
    			destroy_component(section);
    			/*svg_binding*/ ctx[42](null);
    		}
    	};
    }

    // (139:4) <Section       bind:this={node}       x1={0}       x2={width}       y1={0}       y2={height}       {backgroundColor}       {coordinates}       {scaleX}       {scaleY}       {flipX}       {flipY}       {padding}       {zoomIdentity}       {onClick}       {onWheel}       {onMousedown}       {onMouseup}       {onMouseover}       {onMouseout}       {onMousemove}       {onPinch}       {onTouchdown}       {onTouchmove}       {onTouchup}       {onTouchover}       {onTouchout}       {clip}     >
    function create_default_slot_1$1(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[40].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[45], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty[1] & /*$$scope*/ 16384)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[45],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[45])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[45], dirty, null),
    						null
    					);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (177:0) {#if renderer === 'canvas'}
    function create_if_block$4(ctx) {
    	let canvas;
    	let t;
    	let section;
    	let current;

    	let section_props = {
    		x1: 0,
    		x2: /*width*/ ctx[0],
    		y1: 0,
    		y2: /*height*/ ctx[1],
    		backgroundColor: /*backgroundColor*/ ctx[2],
    		coordinates: /*coordinates*/ ctx[3],
    		scaleX: /*scaleX*/ ctx[4],
    		scaleY: /*scaleY*/ ctx[5],
    		flipX: /*flipX*/ ctx[6],
    		flipY: /*flipY*/ ctx[7],
    		padding: /*padding*/ ctx[8],
    		zoomIdentity: /*zoomIdentity*/ ctx[9],
    		onClick: /*onClick*/ ctx[10],
    		onWheel: /*onWheel*/ ctx[11],
    		onMousedown: /*onMousedown*/ ctx[12],
    		onMouseup: /*onMouseup*/ ctx[13],
    		onMouseover: /*onMouseover*/ ctx[14],
    		onMouseout: /*onMouseout*/ ctx[15],
    		onMousemove: /*onMousemove*/ ctx[16],
    		onPinch: /*onPinch*/ ctx[17],
    		onTouchdown: /*onTouchdown*/ ctx[18],
    		onTouchmove: /*onTouchmove*/ ctx[19],
    		onTouchup: /*onTouchup*/ ctx[20],
    		onTouchover: /*onTouchover*/ ctx[21],
    		onTouchout: /*onTouchout*/ ctx[22],
    		clip: /*clip*/ ctx[23],
    		$$slots: { default: [create_default_slot$1] },
    		$$scope: { ctx }
    	};

    	section = new Section({ props: section_props });
    	/*section_binding_1*/ ctx[44](section);

    	return {
    		c() {
    			canvas = element("canvas");
    			t = space();
    			create_component(section.$$.fragment);
    			attr(canvas, "id", /*id*/ ctx[27]);
    			attr(canvas, "width", /*width*/ ctx[0]);
    			attr(canvas, "height", /*height*/ ctx[1]);
    			attr(canvas, "data-testid", testId('root'));
    		},
    		m(target, anchor) {
    			insert(target, canvas, anchor);
    			/*canvas_binding*/ ctx[43](canvas);
    			insert(target, t, anchor);
    			mount_component(section, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (!current || dirty[0] & /*width*/ 1) {
    				attr(canvas, "width", /*width*/ ctx[0]);
    			}

    			if (!current || dirty[0] & /*height*/ 2) {
    				attr(canvas, "height", /*height*/ ctx[1]);
    			}

    			const section_changes = {};
    			if (dirty[0] & /*width*/ 1) section_changes.x2 = /*width*/ ctx[0];
    			if (dirty[0] & /*height*/ 2) section_changes.y2 = /*height*/ ctx[1];
    			if (dirty[0] & /*backgroundColor*/ 4) section_changes.backgroundColor = /*backgroundColor*/ ctx[2];
    			if (dirty[0] & /*coordinates*/ 8) section_changes.coordinates = /*coordinates*/ ctx[3];
    			if (dirty[0] & /*scaleX*/ 16) section_changes.scaleX = /*scaleX*/ ctx[4];
    			if (dirty[0] & /*scaleY*/ 32) section_changes.scaleY = /*scaleY*/ ctx[5];
    			if (dirty[0] & /*flipX*/ 64) section_changes.flipX = /*flipX*/ ctx[6];
    			if (dirty[0] & /*flipY*/ 128) section_changes.flipY = /*flipY*/ ctx[7];
    			if (dirty[0] & /*padding*/ 256) section_changes.padding = /*padding*/ ctx[8];
    			if (dirty[0] & /*zoomIdentity*/ 512) section_changes.zoomIdentity = /*zoomIdentity*/ ctx[9];
    			if (dirty[0] & /*onClick*/ 1024) section_changes.onClick = /*onClick*/ ctx[10];
    			if (dirty[0] & /*onWheel*/ 2048) section_changes.onWheel = /*onWheel*/ ctx[11];
    			if (dirty[0] & /*onMousedown*/ 4096) section_changes.onMousedown = /*onMousedown*/ ctx[12];
    			if (dirty[0] & /*onMouseup*/ 8192) section_changes.onMouseup = /*onMouseup*/ ctx[13];
    			if (dirty[0] & /*onMouseover*/ 16384) section_changes.onMouseover = /*onMouseover*/ ctx[14];
    			if (dirty[0] & /*onMouseout*/ 32768) section_changes.onMouseout = /*onMouseout*/ ctx[15];
    			if (dirty[0] & /*onMousemove*/ 65536) section_changes.onMousemove = /*onMousemove*/ ctx[16];
    			if (dirty[0] & /*onPinch*/ 131072) section_changes.onPinch = /*onPinch*/ ctx[17];
    			if (dirty[0] & /*onTouchdown*/ 262144) section_changes.onTouchdown = /*onTouchdown*/ ctx[18];
    			if (dirty[0] & /*onTouchmove*/ 524288) section_changes.onTouchmove = /*onTouchmove*/ ctx[19];
    			if (dirty[0] & /*onTouchup*/ 1048576) section_changes.onTouchup = /*onTouchup*/ ctx[20];
    			if (dirty[0] & /*onTouchover*/ 2097152) section_changes.onTouchover = /*onTouchover*/ ctx[21];
    			if (dirty[0] & /*onTouchout*/ 4194304) section_changes.onTouchout = /*onTouchout*/ ctx[22];
    			if (dirty[0] & /*clip*/ 8388608) section_changes.clip = /*clip*/ ctx[23];

    			if (dirty[1] & /*$$scope*/ 16384) {
    				section_changes.$$scope = { dirty, ctx };
    			}

    			section.$set(section_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(section.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(section.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(canvas);
    			/*canvas_binding*/ ctx[43](null);
    			if (detaching) detach(t);
    			/*section_binding_1*/ ctx[44](null);
    			destroy_component(section, detaching);
    		}
    	};
    }

    // (181:2) <Section     bind:this={node}     x1={0}     x2={width}     y1={0}     y2={height}     {backgroundColor}     {coordinates}     {scaleX}     {scaleY}     {flipX}     {flipY}     {padding}     {zoomIdentity}     {onClick}     {onWheel}     {onMousedown}     {onMouseup}     {onMouseover}     {onMouseout}     {onMousemove}     {onPinch}     {onTouchdown}     {onTouchmove}     {onTouchup}     {onTouchover}     {onTouchout}     {clip}   >
    function create_default_slot$1(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[40].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[45], null);

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			set_style(div, "display", "none");
    			attr(div, "id", `div-${/*id*/ ctx[27]}`);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty[1] & /*$$scope*/ 16384)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[45],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[45])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[45], dirty, null),
    						null
    					);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$9(ctx) {
    	let t;
    	let if_block1_anchor;
    	let current;
    	let if_block0 = /*renderer*/ ctx[24] === 'svg' && create_if_block_1$3(ctx);
    	let if_block1 = /*renderer*/ ctx[24] === 'canvas' && create_if_block$4(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*renderer*/ ctx[24] === 'svg') {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*renderer*/ 16777216) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_1$3(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t.parentNode, t);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*renderer*/ ctx[24] === 'canvas') {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*renderer*/ 16777216) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block$4(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    		}
    	};
    }

    let idCounter = 0;

    function getId$1() {
    	return 'gr' + idCounter++;
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let $dirty;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { width = 500 } = $$props;
    	let { height = 500 } = $$props;
    	let { backgroundColor = undefined } = $$props;
    	let { coordinates = undefined } = $$props;
    	let { scaleX = undefined } = $$props;
    	let { scaleY = undefined } = $$props;
    	let { flipX = false } = $$props;
    	let { flipY = false } = $$props;
    	let { padding = 0 } = $$props;
    	let { zoomIdentity = undefined } = $$props;
    	let { onClick = undefined } = $$props;
    	let { onWheel = undefined } = $$props;
    	let { onMousedown = undefined } = $$props;
    	let { onMouseup = undefined } = $$props;
    	let { onMouseover = undefined } = $$props;
    	let { onMouseout = undefined } = $$props;
    	let { onMousemove = undefined } = $$props;
    	let { onPinch = undefined } = $$props;
    	let { onTouchdown = undefined } = $$props;
    	let { onTouchmove = undefined } = $$props;
    	let { onTouchup = undefined } = $$props;
    	let { onTouchover = undefined } = $$props;
    	let { onTouchout = undefined } = $$props;
    	let { clip = 'padding' } = $$props;
    	let { renderer = 'svg' } = $$props;
    	let { blockReindexing = undefined } = $$props;
    	let { _testDummies = undefined } = $$props;
    	let mounted = false;
    	const isMounted = () => mounted;
    	const id = getId$1();
    	let rootNode;
    	let context;
    	let dirty = writable(false);
    	component_subscribe($$self, dirty, value => $$invalidate(39, $dirty = value));
    	let globalBlockReindexing = writable(blockReindexing);
    	const marksAndLayers = {};

    	setContext('graphic', {
    		renderer,
    		dirty,
    		marksAndLayers,
    		globalBlockReindexing
    	});

    	// Set up EventManager for this Graphic
    	const eventManager = new EventManager();

    	setContext('eventManager', eventManager);

    	onMount(() => {
    		// Only on mount can we bind the svg root node and attach actual event listeners.
    		// Sometimes rootNode is undefined for some weird reason. In this case,
    		// we will use document.getElementById instead
    		if (!rootNode) {
    			$$invalidate(25, rootNode = document.getElementById(id));
    		}

    		if (renderer === 'canvas') {
    			context = rootNode.getContext('2d');
    		}

    		if (TEST_ENV && _testDummies) {
    			const { dummyRoot, dummyWindow } = _testDummies;
    			eventManager.addRootNode(dummyRoot, renderer, dummyWindow);
    		} else {
    			eventManager.addRootNode(rootNode, renderer);
    		}

    		eventManager.attachEventListeners();
    		mounted = true;
    	});

    	const isEmpty = id => [' ', ''].includes(id);

    	function render() {
    		context.clearRect(0, 0, width, height);
    		const childArray = Array.from(document.getElementById(`div-${id}`).childNodes);

    		for (let i = 0; i < childArray.length; i++) {
    			const id = childArray[i].data;

    			if (!isEmpty(id)) {
    				marksAndLayers[id].render(context);
    			}
    		}
    	}

    	let node;
    	const selectRectangle = rect => node.getSM().selectRectangle(rect);
    	const updateSelectRectangle = rect => node.getSM().updateSelectRectangle(rect);
    	const resetSelectRectangle = () => node.getSM().resetSelectRectangle();
    	const startSelectPolygon = c => node.getSM().startSelectPolygon(c);
    	const addPointToSelectPolygon = c => node.getSM().addPointToSelectPolygon(c);
    	const moveSelectPolygon = delta => node.getSM().moveSelectPolygon(delta);
    	const getSelectPolygon = () => node.getSM().getSelectPolygon();
    	const resetSelectPolygon = () => node.getSM().resetSelectPolygon();

    	function section_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			node = $$value;
    			$$invalidate(26, node);
    		});
    	}

    	function svg_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			rootNode = $$value;
    			$$invalidate(25, rootNode);
    		});
    	}

    	function canvas_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			rootNode = $$value;
    			$$invalidate(25, rootNode);
    		});
    	}

    	function section_binding_1($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			node = $$value;
    			$$invalidate(26, node);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('width' in $$props) $$invalidate(0, width = $$props.width);
    		if ('height' in $$props) $$invalidate(1, height = $$props.height);
    		if ('backgroundColor' in $$props) $$invalidate(2, backgroundColor = $$props.backgroundColor);
    		if ('coordinates' in $$props) $$invalidate(3, coordinates = $$props.coordinates);
    		if ('scaleX' in $$props) $$invalidate(4, scaleX = $$props.scaleX);
    		if ('scaleY' in $$props) $$invalidate(5, scaleY = $$props.scaleY);
    		if ('flipX' in $$props) $$invalidate(6, flipX = $$props.flipX);
    		if ('flipY' in $$props) $$invalidate(7, flipY = $$props.flipY);
    		if ('padding' in $$props) $$invalidate(8, padding = $$props.padding);
    		if ('zoomIdentity' in $$props) $$invalidate(9, zoomIdentity = $$props.zoomIdentity);
    		if ('onClick' in $$props) $$invalidate(10, onClick = $$props.onClick);
    		if ('onWheel' in $$props) $$invalidate(11, onWheel = $$props.onWheel);
    		if ('onMousedown' in $$props) $$invalidate(12, onMousedown = $$props.onMousedown);
    		if ('onMouseup' in $$props) $$invalidate(13, onMouseup = $$props.onMouseup);
    		if ('onMouseover' in $$props) $$invalidate(14, onMouseover = $$props.onMouseover);
    		if ('onMouseout' in $$props) $$invalidate(15, onMouseout = $$props.onMouseout);
    		if ('onMousemove' in $$props) $$invalidate(16, onMousemove = $$props.onMousemove);
    		if ('onPinch' in $$props) $$invalidate(17, onPinch = $$props.onPinch);
    		if ('onTouchdown' in $$props) $$invalidate(18, onTouchdown = $$props.onTouchdown);
    		if ('onTouchmove' in $$props) $$invalidate(19, onTouchmove = $$props.onTouchmove);
    		if ('onTouchup' in $$props) $$invalidate(20, onTouchup = $$props.onTouchup);
    		if ('onTouchover' in $$props) $$invalidate(21, onTouchover = $$props.onTouchover);
    		if ('onTouchout' in $$props) $$invalidate(22, onTouchout = $$props.onTouchout);
    		if ('clip' in $$props) $$invalidate(23, clip = $$props.clip);
    		if ('renderer' in $$props) $$invalidate(24, renderer = $$props.renderer);
    		if ('blockReindexing' in $$props) $$invalidate(29, blockReindexing = $$props.blockReindexing);
    		if ('_testDummies' in $$props) $$invalidate(30, _testDummies = $$props._testDummies);
    		if ('$$scope' in $$props) $$invalidate(45, $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*blockReindexing*/ 536870912) {
    			{
    				if (isMounted()) globalBlockReindexing.set(blockReindexing);
    			}
    		}

    		if ($$self.$$.dirty[1] & /*$dirty*/ 256) {
    			{
    				if ($dirty) {
    					tick().then(() => {
    						render();
    						dirty.set(false);
    					});
    				}
    			}
    		}
    	};

    	return [
    		width,
    		height,
    		backgroundColor,
    		coordinates,
    		scaleX,
    		scaleY,
    		flipX,
    		flipY,
    		padding,
    		zoomIdentity,
    		onClick,
    		onWheel,
    		onMousedown,
    		onMouseup,
    		onMouseover,
    		onMouseout,
    		onMousemove,
    		onPinch,
    		onTouchdown,
    		onTouchmove,
    		onTouchup,
    		onTouchover,
    		onTouchout,
    		clip,
    		renderer,
    		rootNode,
    		node,
    		id,
    		dirty,
    		blockReindexing,
    		_testDummies,
    		selectRectangle,
    		updateSelectRectangle,
    		resetSelectRectangle,
    		startSelectPolygon,
    		addPointToSelectPolygon,
    		moveSelectPolygon,
    		getSelectPolygon,
    		resetSelectPolygon,
    		$dirty,
    		slots,
    		section_binding,
    		svg_binding,
    		canvas_binding,
    		section_binding_1,
    		$$scope
    	];
    }

    class Graphic extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$9,
    			create_fragment$9,
    			safe_not_equal,
    			{
    				width: 0,
    				height: 1,
    				backgroundColor: 2,
    				coordinates: 3,
    				scaleX: 4,
    				scaleY: 5,
    				flipX: 6,
    				flipY: 7,
    				padding: 8,
    				zoomIdentity: 9,
    				onClick: 10,
    				onWheel: 11,
    				onMousedown: 12,
    				onMouseup: 13,
    				onMouseover: 14,
    				onMouseout: 15,
    				onMousemove: 16,
    				onPinch: 17,
    				onTouchdown: 18,
    				onTouchmove: 19,
    				onTouchup: 20,
    				onTouchover: 21,
    				onTouchout: 22,
    				clip: 23,
    				renderer: 24,
    				blockReindexing: 29,
    				_testDummies: 30,
    				selectRectangle: 31,
    				updateSelectRectangle: 32,
    				resetSelectRectangle: 33,
    				startSelectPolygon: 34,
    				addPointToSelectPolygon: 35,
    				moveSelectPolygon: 36,
    				getSelectPolygon: 37,
    				resetSelectPolygon: 38
    			},
    			null,
    			[-1, -1]
    		);
    	}

    	get selectRectangle() {
    		return this.$$.ctx[31];
    	}

    	get updateSelectRectangle() {
    		return this.$$.ctx[32];
    	}

    	get resetSelectRectangle() {
    		return this.$$.ctx[33];
    	}

    	get startSelectPolygon() {
    		return this.$$.ctx[34];
    	}

    	get addPointToSelectPolygon() {
    		return this.$$.ctx[35];
    	}

    	get moveSelectPolygon() {
    		return this.$$.ctx[36];
    	}

    	get getSelectPolygon() {
    		return this.$$.ctx[37];
    	}

    	get resetSelectPolygon() {
    		return this.$$.ctx[38];
    	}
    }

    /* node_modules/@snlab/florence/src/components/marks/label/Label.svelte generated by Svelte v3.49.0 */

    function create_fragment$8(ctx) {
    	let mark;
    	let current;

    	mark = new Mark({
    			props: {
    				positioning: /*positioning*/ ctx[16],
    				aesthetics: /*aesthetics*/ ctx[15],
    				createMark: createLabel,
    				parseAesthetics: parseAestheticsLabel,
    				className: "label",
    				element: "text",
    				outputSettings: /*outputSettings*/ ctx[0],
    				blockReindexing: /*blockReindexing*/ ctx[1],
    				onClick: /*onClick*/ ctx[2],
    				onMousedown: /*onMousedown*/ ctx[3],
    				onMouseup: /*onMouseup*/ ctx[4],
    				onMouseover: /*onMouseover*/ ctx[5],
    				onMouseout: /*onMouseout*/ ctx[6],
    				onMousedrag: /*onMousedrag*/ ctx[7],
    				onTouchdown: /*onTouchdown*/ ctx[8],
    				onTouchup: /*onTouchup*/ ctx[9],
    				onTouchover: /*onTouchover*/ ctx[10],
    				onTouchout: /*onTouchout*/ ctx[11],
    				onTouchdrag: /*onTouchdrag*/ ctx[12],
    				onSelect: /*onSelect*/ ctx[13],
    				onDeselect: /*onDeselect*/ ctx[14]
    			}
    		});

    	return {
    		c() {
    			create_component(mark.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(mark, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const mark_changes = {};
    			if (dirty[0] & /*positioning*/ 65536) mark_changes.positioning = /*positioning*/ ctx[16];
    			if (dirty[0] & /*aesthetics*/ 32768) mark_changes.aesthetics = /*aesthetics*/ ctx[15];
    			if (dirty[0] & /*outputSettings*/ 1) mark_changes.outputSettings = /*outputSettings*/ ctx[0];
    			if (dirty[0] & /*blockReindexing*/ 2) mark_changes.blockReindexing = /*blockReindexing*/ ctx[1];
    			if (dirty[0] & /*onClick*/ 4) mark_changes.onClick = /*onClick*/ ctx[2];
    			if (dirty[0] & /*onMousedown*/ 8) mark_changes.onMousedown = /*onMousedown*/ ctx[3];
    			if (dirty[0] & /*onMouseup*/ 16) mark_changes.onMouseup = /*onMouseup*/ ctx[4];
    			if (dirty[0] & /*onMouseover*/ 32) mark_changes.onMouseover = /*onMouseover*/ ctx[5];
    			if (dirty[0] & /*onMouseout*/ 64) mark_changes.onMouseout = /*onMouseout*/ ctx[6];
    			if (dirty[0] & /*onMousedrag*/ 128) mark_changes.onMousedrag = /*onMousedrag*/ ctx[7];
    			if (dirty[0] & /*onTouchdown*/ 256) mark_changes.onTouchdown = /*onTouchdown*/ ctx[8];
    			if (dirty[0] & /*onTouchup*/ 512) mark_changes.onTouchup = /*onTouchup*/ ctx[9];
    			if (dirty[0] & /*onTouchover*/ 1024) mark_changes.onTouchover = /*onTouchover*/ ctx[10];
    			if (dirty[0] & /*onTouchout*/ 2048) mark_changes.onTouchout = /*onTouchout*/ ctx[11];
    			if (dirty[0] & /*onTouchdrag*/ 4096) mark_changes.onTouchdrag = /*onTouchdrag*/ ctx[12];
    			if (dirty[0] & /*onSelect*/ 8192) mark_changes.onSelect = /*onSelect*/ ctx[13];
    			if (dirty[0] & /*onDeselect*/ 16384) mark_changes.onDeselect = /*onDeselect*/ ctx[14];
    			mark.$set(mark_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(mark.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(mark.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(mark, detaching);
    		}
    	};
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let positioning;
    	let aesthetics;
    	let { x = undefined } = $$props;
    	let { y = undefined } = $$props;
    	let { geometry = undefined } = $$props;
    	let { rotate = undefined } = $$props;
    	let { anchorPoint = undefined } = $$props;
    	let { text = undefined } = $$props;
    	let { fontSize = undefined } = $$props;
    	let { fontFamily = undefined } = $$props;
    	let { fontWeight = undefined } = $$props;
    	let { fill = undefined } = $$props;
    	let { stroke = undefined } = $$props;
    	let { strokeWidth = undefined } = $$props;
    	let { strokeOpacity = undefined } = $$props;
    	let { fillOpacity = undefined } = $$props;
    	let { opacity = undefined } = $$props;
    	let { outputSettings = undefined } = $$props;
    	let { clip = undefined } = $$props;
    	let { blockReindexing = undefined } = $$props;
    	let { onClick = undefined } = $$props;
    	let { onMousedown = undefined } = $$props;
    	let { onMouseup = undefined } = $$props;
    	let { onMouseover = undefined } = $$props;
    	let { onMouseout = undefined } = $$props;
    	let { onMousedrag = undefined } = $$props;
    	let { onTouchdown = undefined } = $$props;
    	let { onTouchup = undefined } = $$props;
    	let { onTouchover = undefined } = $$props;
    	let { onTouchout = undefined } = $$props;
    	let { onTouchdrag = undefined } = $$props;
    	let { onSelect = undefined } = $$props;
    	let { onDeselect = undefined } = $$props;

    	$$self.$$set = $$props => {
    		if ('x' in $$props) $$invalidate(17, x = $$props.x);
    		if ('y' in $$props) $$invalidate(18, y = $$props.y);
    		if ('geometry' in $$props) $$invalidate(19, geometry = $$props.geometry);
    		if ('rotate' in $$props) $$invalidate(20, rotate = $$props.rotate);
    		if ('anchorPoint' in $$props) $$invalidate(21, anchorPoint = $$props.anchorPoint);
    		if ('text' in $$props) $$invalidate(22, text = $$props.text);
    		if ('fontSize' in $$props) $$invalidate(23, fontSize = $$props.fontSize);
    		if ('fontFamily' in $$props) $$invalidate(24, fontFamily = $$props.fontFamily);
    		if ('fontWeight' in $$props) $$invalidate(25, fontWeight = $$props.fontWeight);
    		if ('fill' in $$props) $$invalidate(26, fill = $$props.fill);
    		if ('stroke' in $$props) $$invalidate(27, stroke = $$props.stroke);
    		if ('strokeWidth' in $$props) $$invalidate(28, strokeWidth = $$props.strokeWidth);
    		if ('strokeOpacity' in $$props) $$invalidate(29, strokeOpacity = $$props.strokeOpacity);
    		if ('fillOpacity' in $$props) $$invalidate(30, fillOpacity = $$props.fillOpacity);
    		if ('opacity' in $$props) $$invalidate(31, opacity = $$props.opacity);
    		if ('outputSettings' in $$props) $$invalidate(0, outputSettings = $$props.outputSettings);
    		if ('clip' in $$props) $$invalidate(32, clip = $$props.clip);
    		if ('blockReindexing' in $$props) $$invalidate(1, blockReindexing = $$props.blockReindexing);
    		if ('onClick' in $$props) $$invalidate(2, onClick = $$props.onClick);
    		if ('onMousedown' in $$props) $$invalidate(3, onMousedown = $$props.onMousedown);
    		if ('onMouseup' in $$props) $$invalidate(4, onMouseup = $$props.onMouseup);
    		if ('onMouseover' in $$props) $$invalidate(5, onMouseover = $$props.onMouseover);
    		if ('onMouseout' in $$props) $$invalidate(6, onMouseout = $$props.onMouseout);
    		if ('onMousedrag' in $$props) $$invalidate(7, onMousedrag = $$props.onMousedrag);
    		if ('onTouchdown' in $$props) $$invalidate(8, onTouchdown = $$props.onTouchdown);
    		if ('onTouchup' in $$props) $$invalidate(9, onTouchup = $$props.onTouchup);
    		if ('onTouchover' in $$props) $$invalidate(10, onTouchover = $$props.onTouchover);
    		if ('onTouchout' in $$props) $$invalidate(11, onTouchout = $$props.onTouchout);
    		if ('onTouchdrag' in $$props) $$invalidate(12, onTouchdrag = $$props.onTouchdrag);
    		if ('onSelect' in $$props) $$invalidate(13, onSelect = $$props.onSelect);
    		if ('onDeselect' in $$props) $$invalidate(14, onDeselect = $$props.onDeselect);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*x, y, geometry, rotate, anchorPoint, text, fontSize*/ 16646144) {
    			$$invalidate(16, positioning = {
    				x,
    				y,
    				geometry,
    				rotate,
    				anchorPoint,
    				text,
    				fontSize
    			});
    		}

    		if ($$self.$$.dirty[0] & /*anchorPoint, text, fontSize, fontFamily, fontWeight, fill, stroke, strokeWidth, strokeOpacity, fillOpacity*/ 2145386496 | $$self.$$.dirty[1] & /*opacity, clip*/ 3) {
    			$$invalidate(15, aesthetics = {
    				anchorPoint,
    				text,
    				fontSize,
    				fontFamily,
    				fontWeight,
    				fill,
    				stroke,
    				strokeWidth,
    				strokeOpacity,
    				fillOpacity,
    				opacity,
    				clip
    			});
    		}
    	};

    	return [
    		outputSettings,
    		blockReindexing,
    		onClick,
    		onMousedown,
    		onMouseup,
    		onMouseover,
    		onMouseout,
    		onMousedrag,
    		onTouchdown,
    		onTouchup,
    		onTouchover,
    		onTouchout,
    		onTouchdrag,
    		onSelect,
    		onDeselect,
    		aesthetics,
    		positioning,
    		x,
    		y,
    		geometry,
    		rotate,
    		anchorPoint,
    		text,
    		fontSize,
    		fontFamily,
    		fontWeight,
    		fill,
    		stroke,
    		strokeWidth,
    		strokeOpacity,
    		fillOpacity,
    		opacity,
    		clip
    	];
    }

    class Label extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$8,
    			create_fragment$8,
    			safe_not_equal,
    			{
    				x: 17,
    				y: 18,
    				geometry: 19,
    				rotate: 20,
    				anchorPoint: 21,
    				text: 22,
    				fontSize: 23,
    				fontFamily: 24,
    				fontWeight: 25,
    				fill: 26,
    				stroke: 27,
    				strokeWidth: 28,
    				strokeOpacity: 29,
    				fillOpacity: 30,
    				opacity: 31,
    				outputSettings: 0,
    				clip: 32,
    				blockReindexing: 1,
    				onClick: 2,
    				onMousedown: 3,
    				onMouseup: 4,
    				onMouseover: 5,
    				onMouseout: 6,
    				onMousedrag: 7,
    				onTouchdown: 8,
    				onTouchup: 9,
    				onTouchover: 10,
    				onTouchout: 11,
    				onTouchdrag: 12,
    				onSelect: 13,
    				onDeselect: 14
    			},
    			null,
    			[-1, -1]
    		);
    	}
    }

    /* node_modules/@snlab/florence/src/components/marks/line/Line.svelte generated by Svelte v3.49.0 */

    function create_fragment$7(ctx) {
    	let mark;
    	let current;

    	mark = new Mark({
    			props: {
    				positioning: /*positioning*/ ctx[16],
    				aesthetics: /*aesthetics*/ ctx[15],
    				createMark: createLine,
    				parseAesthetics: parseAestheticsLine,
    				className: "line",
    				outputSettings: /*outputSettings*/ ctx[0],
    				blockReindexing: /*blockReindexing*/ ctx[1],
    				onClick: /*onClick*/ ctx[2],
    				onMousedown: /*onMousedown*/ ctx[3],
    				onMouseup: /*onMouseup*/ ctx[4],
    				onMouseover: /*onMouseover*/ ctx[5],
    				onMouseout: /*onMouseout*/ ctx[6],
    				onMousedrag: /*onMousedrag*/ ctx[7],
    				onTouchdown: /*onTouchdown*/ ctx[8],
    				onTouchup: /*onTouchup*/ ctx[9],
    				onTouchover: /*onTouchover*/ ctx[10],
    				onTouchout: /*onTouchout*/ ctx[11],
    				onTouchdrag: /*onTouchdrag*/ ctx[12],
    				onSelect: /*onSelect*/ ctx[13],
    				onDeselect: /*onDeselect*/ ctx[14]
    			}
    		});

    	return {
    		c() {
    			create_component(mark.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(mark, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const mark_changes = {};
    			if (dirty & /*positioning*/ 65536) mark_changes.positioning = /*positioning*/ ctx[16];
    			if (dirty & /*aesthetics*/ 32768) mark_changes.aesthetics = /*aesthetics*/ ctx[15];
    			if (dirty & /*outputSettings*/ 1) mark_changes.outputSettings = /*outputSettings*/ ctx[0];
    			if (dirty & /*blockReindexing*/ 2) mark_changes.blockReindexing = /*blockReindexing*/ ctx[1];
    			if (dirty & /*onClick*/ 4) mark_changes.onClick = /*onClick*/ ctx[2];
    			if (dirty & /*onMousedown*/ 8) mark_changes.onMousedown = /*onMousedown*/ ctx[3];
    			if (dirty & /*onMouseup*/ 16) mark_changes.onMouseup = /*onMouseup*/ ctx[4];
    			if (dirty & /*onMouseover*/ 32) mark_changes.onMouseover = /*onMouseover*/ ctx[5];
    			if (dirty & /*onMouseout*/ 64) mark_changes.onMouseout = /*onMouseout*/ ctx[6];
    			if (dirty & /*onMousedrag*/ 128) mark_changes.onMousedrag = /*onMousedrag*/ ctx[7];
    			if (dirty & /*onTouchdown*/ 256) mark_changes.onTouchdown = /*onTouchdown*/ ctx[8];
    			if (dirty & /*onTouchup*/ 512) mark_changes.onTouchup = /*onTouchup*/ ctx[9];
    			if (dirty & /*onTouchover*/ 1024) mark_changes.onTouchover = /*onTouchover*/ ctx[10];
    			if (dirty & /*onTouchout*/ 2048) mark_changes.onTouchout = /*onTouchout*/ ctx[11];
    			if (dirty & /*onTouchdrag*/ 4096) mark_changes.onTouchdrag = /*onTouchdrag*/ ctx[12];
    			if (dirty & /*onSelect*/ 8192) mark_changes.onSelect = /*onSelect*/ ctx[13];
    			if (dirty & /*onDeselect*/ 16384) mark_changes.onDeselect = /*onDeselect*/ ctx[14];
    			mark.$set(mark_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(mark.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(mark.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(mark, detaching);
    		}
    	};
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let positioning;
    	let aesthetics;
    	let { x = undefined } = $$props;
    	let { y = undefined } = $$props;
    	let { geometry = undefined } = $$props;
    	let { curve = undefined } = $$props;
    	let { _resampleIntervals = undefined } = $$props;
    	let { stroke = undefined } = $$props;
    	let { strokeWidth = undefined } = $$props;
    	let { opacity = undefined } = $$props;
    	let { lineCap = undefined } = $$props;
    	let { lineJoin = undefined } = $$props;
    	let { miterLimit = undefined } = $$props;
    	let { dashArray = undefined } = $$props;
    	let { dashOffset = undefined } = $$props;
    	let { outputSettings = undefined } = $$props;
    	let { clip = undefined } = $$props;
    	let { blockReindexing = undefined } = $$props;
    	let { onClick = undefined } = $$props;
    	let { onMousedown = undefined } = $$props;
    	let { onMouseup = undefined } = $$props;
    	let { onMouseover = undefined } = $$props;
    	let { onMouseout = undefined } = $$props;
    	let { onMousedrag = undefined } = $$props;
    	let { onTouchdown = undefined } = $$props;
    	let { onTouchup = undefined } = $$props;
    	let { onTouchover = undefined } = $$props;
    	let { onTouchout = undefined } = $$props;
    	let { onTouchdrag = undefined } = $$props;
    	let { onSelect = undefined } = $$props;
    	let { onDeselect = undefined } = $$props;

    	$$self.$$set = $$props => {
    		if ('x' in $$props) $$invalidate(17, x = $$props.x);
    		if ('y' in $$props) $$invalidate(18, y = $$props.y);
    		if ('geometry' in $$props) $$invalidate(19, geometry = $$props.geometry);
    		if ('curve' in $$props) $$invalidate(20, curve = $$props.curve);
    		if ('_resampleIntervals' in $$props) $$invalidate(21, _resampleIntervals = $$props._resampleIntervals);
    		if ('stroke' in $$props) $$invalidate(22, stroke = $$props.stroke);
    		if ('strokeWidth' in $$props) $$invalidate(23, strokeWidth = $$props.strokeWidth);
    		if ('opacity' in $$props) $$invalidate(24, opacity = $$props.opacity);
    		if ('lineCap' in $$props) $$invalidate(25, lineCap = $$props.lineCap);
    		if ('lineJoin' in $$props) $$invalidate(26, lineJoin = $$props.lineJoin);
    		if ('miterLimit' in $$props) $$invalidate(27, miterLimit = $$props.miterLimit);
    		if ('dashArray' in $$props) $$invalidate(28, dashArray = $$props.dashArray);
    		if ('dashOffset' in $$props) $$invalidate(29, dashOffset = $$props.dashOffset);
    		if ('outputSettings' in $$props) $$invalidate(0, outputSettings = $$props.outputSettings);
    		if ('clip' in $$props) $$invalidate(30, clip = $$props.clip);
    		if ('blockReindexing' in $$props) $$invalidate(1, blockReindexing = $$props.blockReindexing);
    		if ('onClick' in $$props) $$invalidate(2, onClick = $$props.onClick);
    		if ('onMousedown' in $$props) $$invalidate(3, onMousedown = $$props.onMousedown);
    		if ('onMouseup' in $$props) $$invalidate(4, onMouseup = $$props.onMouseup);
    		if ('onMouseover' in $$props) $$invalidate(5, onMouseover = $$props.onMouseover);
    		if ('onMouseout' in $$props) $$invalidate(6, onMouseout = $$props.onMouseout);
    		if ('onMousedrag' in $$props) $$invalidate(7, onMousedrag = $$props.onMousedrag);
    		if ('onTouchdown' in $$props) $$invalidate(8, onTouchdown = $$props.onTouchdown);
    		if ('onTouchup' in $$props) $$invalidate(9, onTouchup = $$props.onTouchup);
    		if ('onTouchover' in $$props) $$invalidate(10, onTouchover = $$props.onTouchover);
    		if ('onTouchout' in $$props) $$invalidate(11, onTouchout = $$props.onTouchout);
    		if ('onTouchdrag' in $$props) $$invalidate(12, onTouchdrag = $$props.onTouchdrag);
    		if ('onSelect' in $$props) $$invalidate(13, onSelect = $$props.onSelect);
    		if ('onDeselect' in $$props) $$invalidate(14, onDeselect = $$props.onDeselect);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*x, y, geometry, curve, _resampleIntervals*/ 4063232) {
    			$$invalidate(16, positioning = {
    				x,
    				y,
    				geometry,
    				curve,
    				_resampleIntervals
    			});
    		}

    		if ($$self.$$.dirty & /*stroke, strokeWidth, opacity, lineCap, dashArray, lineJoin, miterLimit, dashOffset, clip*/ 2143289344) {
    			$$invalidate(15, aesthetics = {
    				stroke,
    				strokeWidth,
    				opacity,
    				lineCap,
    				dashArray,
    				lineJoin,
    				miterLimit,
    				dashOffset,
    				clip
    			});
    		}
    	};

    	return [
    		outputSettings,
    		blockReindexing,
    		onClick,
    		onMousedown,
    		onMouseup,
    		onMouseover,
    		onMouseout,
    		onMousedrag,
    		onTouchdown,
    		onTouchup,
    		onTouchover,
    		onTouchout,
    		onTouchdrag,
    		onSelect,
    		onDeselect,
    		aesthetics,
    		positioning,
    		x,
    		y,
    		geometry,
    		curve,
    		_resampleIntervals,
    		stroke,
    		strokeWidth,
    		opacity,
    		lineCap,
    		lineJoin,
    		miterLimit,
    		dashArray,
    		dashOffset,
    		clip
    	];
    }

    class Line extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {
    			x: 17,
    			y: 18,
    			geometry: 19,
    			curve: 20,
    			_resampleIntervals: 21,
    			stroke: 22,
    			strokeWidth: 23,
    			opacity: 24,
    			lineCap: 25,
    			lineJoin: 26,
    			miterLimit: 27,
    			dashArray: 28,
    			dashOffset: 29,
    			outputSettings: 0,
    			clip: 30,
    			blockReindexing: 1,
    			onClick: 2,
    			onMousedown: 3,
    			onMouseup: 4,
    			onMouseover: 5,
    			onMouseout: 6,
    			onMousedrag: 7,
    			onTouchdown: 8,
    			onTouchup: 9,
    			onTouchover: 10,
    			onTouchout: 11,
    			onTouchdrag: 12,
    			onSelect: 13,
    			onDeselect: 14
    		});
    	}
    }

    /* node_modules/@snlab/florence/src/components/marks/base/Layer.svelte generated by Svelte v3.49.0 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[49] = list[i];
    	child_ctx[51] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[49] = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[49] = list[i];
    	child_ctx[51] = i;
    	return child_ctx;
    }

    function get_each_context_3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[49] = list[i];
    	return child_ctx;
    }

    // (233:0) {#if renderer === 'svg'}
    function create_if_block_1$2(ctx) {
    	let g;
    	let if_block0_anchor;
    	let if_block1_anchor;
    	let if_block2_anchor;
    	let g_clip_path_value;
    	let g_data_testid_value;
    	let if_block0 = /*element*/ ctx[2] === 'path' && /*aesthetics*/ ctx[0].keys === undefined && create_if_block_5(ctx);
    	let if_block1 = /*element*/ ctx[2] === 'path' && /*aesthetics*/ ctx[0].keys !== undefined && create_if_block_4(ctx);
    	let if_block2 = /*element*/ ctx[2] === 'text' && /*aesthetics*/ ctx[0].keys === undefined && create_if_block_3(ctx);
    	let if_block3 = /*element*/ ctx[2] === 'text' && /*aesthetics*/ ctx[0].keys !== undefined && create_if_block_2$2(ctx);

    	return {
    		c() {
    			g = svg_element("g");
    			if (if_block0) if_block0.c();
    			if_block0_anchor = empty();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    			if (if_block2) if_block2.c();
    			if_block2_anchor = empty();
    			if (if_block3) if_block3.c();
    			attr(g, "class", /*className*/ ctx[1]);
    			attr(g, "clip-path", g_clip_path_value = getClipPathURL(/*aesthetics*/ ctx[0], /*$section*/ ctx[3]));
    			attr(g, "data-testid", g_data_testid_value = testId(/*className*/ ctx[1]));
    		},
    		m(target, anchor) {
    			insert(target, g, anchor);
    			if (if_block0) if_block0.m(g, null);
    			append(g, if_block0_anchor);
    			if (if_block1) if_block1.m(g, null);
    			append(g, if_block1_anchor);
    			if (if_block2) if_block2.m(g, null);
    			append(g, if_block2_anchor);
    			if (if_block3) if_block3.m(g, null);
    		},
    		p(ctx, dirty) {
    			if (/*element*/ ctx[2] === 'path' && /*aesthetics*/ ctx[0].keys === undefined) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_5(ctx);
    					if_block0.c();
    					if_block0.m(g, if_block0_anchor);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*element*/ ctx[2] === 'path' && /*aesthetics*/ ctx[0].keys !== undefined) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_4(ctx);
    					if_block1.c();
    					if_block1.m(g, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*element*/ ctx[2] === 'text' && /*aesthetics*/ ctx[0].keys === undefined) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block_3(ctx);
    					if_block2.c();
    					if_block2.m(g, if_block2_anchor);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (/*element*/ ctx[2] === 'text' && /*aesthetics*/ ctx[0].keys !== undefined) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);
    				} else {
    					if_block3 = create_if_block_2$2(ctx);
    					if_block3.c();
    					if_block3.m(g, null);
    				}
    			} else if (if_block3) {
    				if_block3.d(1);
    				if_block3 = null;
    			}

    			if (dirty[0] & /*className*/ 2) {
    				attr(g, "class", /*className*/ ctx[1]);
    			}

    			if (dirty[0] & /*aesthetics, $section*/ 9 && g_clip_path_value !== (g_clip_path_value = getClipPathURL(/*aesthetics*/ ctx[0], /*$section*/ ctx[3]))) {
    				attr(g, "clip-path", g_clip_path_value);
    			}

    			if (dirty[0] & /*className*/ 2 && g_data_testid_value !== (g_data_testid_value = testId(/*className*/ ctx[1]))) {
    				attr(g, "data-testid", g_data_testid_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(g);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    		}
    	};
    }

    // (241:4) {#if element === 'path' && aesthetics.keys === undefined}
    function create_if_block_5(ctx) {
    	let each_1_anchor;
    	let each_value_3 = /*svgData*/ ctx[4];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_3.length; i += 1) {
    		each_blocks[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*svgData, className*/ 18) {
    				each_value_3 = /*svgData*/ ctx[4];
    				let i;

    				for (i = 0; i < each_value_3.length; i += 1) {
    					const child_ctx = get_each_context_3(ctx, each_value_3, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_3.length;
    			}
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (242:6) {#each svgData as mark}
    function create_each_block_3(ctx) {
    	let path;
    	let path_data_testid_value;

    	let path_levels = [
    		/*mark*/ ctx[49],
    		{
    			"data-testid": path_data_testid_value = testId(`${/*className*/ ctx[1]}-mark`)
    		}
    	];

    	let path_data = {};

    	for (let i = 0; i < path_levels.length; i += 1) {
    		path_data = assign(path_data, path_levels[i]);
    	}

    	return {
    		c() {
    			path = svg_element("path");
    			set_svg_attributes(path, path_data);
    		},
    		m(target, anchor) {
    			insert(target, path, anchor);
    		},
    		p(ctx, dirty) {
    			set_svg_attributes(path, path_data = get_spread_update(path_levels, [
    				dirty[0] & /*svgData*/ 16 && /*mark*/ ctx[49],
    				dirty[0] & /*className*/ 2 && path_data_testid_value !== (path_data_testid_value = testId(`${/*className*/ ctx[1]}-mark`)) && { "data-testid": path_data_testid_value }
    			]));
    		},
    		d(detaching) {
    			if (detaching) detach(path);
    		}
    	};
    }

    // (250:4) {#if element === 'path' && aesthetics.keys !== undefined}
    function create_if_block_4(ctx) {
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let each_1_anchor;
    	let each_value_2 = /*svgData*/ ctx[4];
    	const get_key = ctx => /*aesthetics*/ ctx[0].keys[/*i*/ ctx[51]];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		let child_ctx = get_each_context_2(ctx, each_value_2, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block_2(key, child_ctx));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*svgData, className, aesthetics*/ 19) {
    				each_value_2 = /*svgData*/ ctx[4];
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value_2, each_1_lookup, each_1_anchor.parentNode, destroy_block, create_each_block_2, each_1_anchor, get_each_context_2);
    			}
    		},
    		d(detaching) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (251:6) {#each svgData as mark, i (aesthetics.keys[i])}
    function create_each_block_2(key_1, ctx) {
    	let path;
    	let path_data_testid_value;

    	let path_levels = [
    		/*mark*/ ctx[49],
    		{
    			"data-testid": path_data_testid_value = testId(`${/*className*/ ctx[1]}-mark`)
    		}
    	];

    	let path_data = {};

    	for (let i = 0; i < path_levels.length; i += 1) {
    		path_data = assign(path_data, path_levels[i]);
    	}

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			path = svg_element("path");
    			set_svg_attributes(path, path_data);
    			this.first = path;
    		},
    		m(target, anchor) {
    			insert(target, path, anchor);
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			set_svg_attributes(path, path_data = get_spread_update(path_levels, [
    				dirty[0] & /*svgData*/ 16 && /*mark*/ ctx[49],
    				dirty[0] & /*className*/ 2 && path_data_testid_value !== (path_data_testid_value = testId(`${/*className*/ ctx[1]}-mark`)) && { "data-testid": path_data_testid_value }
    			]));
    		},
    		d(detaching) {
    			if (detaching) detach(path);
    		}
    	};
    }

    // (259:4) {#if element === 'text' && aesthetics.keys === undefined}
    function create_if_block_3(ctx) {
    	let each_1_anchor;
    	let each_value_1 = /*svgData*/ ctx[4];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*svgData, className*/ 18) {
    				each_value_1 = /*svgData*/ ctx[4];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (260:6) {#each svgData as mark}
    function create_each_block_1(ctx) {
    	let text_1;
    	let t_value = /*mark*/ ctx[49].text + "";
    	let t;
    	let text_1_data_testid_value;

    	let text_1_levels = [
    		/*mark*/ ctx[49],
    		{ text: undefined },
    		{
    			"data-testid": text_1_data_testid_value = testId(`${/*className*/ ctx[1]}-mark`)
    		}
    	];

    	let text_1_data = {};

    	for (let i = 0; i < text_1_levels.length; i += 1) {
    		text_1_data = assign(text_1_data, text_1_levels[i]);
    	}

    	return {
    		c() {
    			text_1 = svg_element("text");
    			t = text(t_value);
    			set_svg_attributes(text_1, text_1_data);
    		},
    		m(target, anchor) {
    			insert(target, text_1, anchor);
    			append(text_1, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*svgData*/ 16 && t_value !== (t_value = /*mark*/ ctx[49].text + "")) set_data(t, t_value);

    			set_svg_attributes(text_1, text_1_data = get_spread_update(text_1_levels, [
    				dirty[0] & /*svgData*/ 16 && /*mark*/ ctx[49],
    				{ text: undefined },
    				dirty[0] & /*className*/ 2 && text_1_data_testid_value !== (text_1_data_testid_value = testId(`${/*className*/ ctx[1]}-mark`)) && { "data-testid": text_1_data_testid_value }
    			]));
    		},
    		d(detaching) {
    			if (detaching) detach(text_1);
    		}
    	};
    }

    // (271:4) {#if element === 'text' && aesthetics.keys !== undefined}
    function create_if_block_2$2(ctx) {
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let each_1_anchor;
    	let each_value = /*svgData*/ ctx[4];
    	const get_key = ctx => /*aesthetics*/ ctx[0].keys[/*i*/ ctx[51]];

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*svgData, className, aesthetics*/ 19) {
    				each_value = /*svgData*/ ctx[4];
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, each_1_anchor.parentNode, destroy_block, create_each_block, each_1_anchor, get_each_context);
    			}
    		},
    		d(detaching) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (272:6) {#each svgData as mark, i (aesthetics.keys[i])}
    function create_each_block(key_1, ctx) {
    	let text_1;
    	let t_value = /*mark*/ ctx[49].text + "";
    	let t;
    	let text_1_data_testid_value;

    	let text_1_levels = [
    		/*mark*/ ctx[49],
    		{ text: undefined },
    		{
    			"data-testid": text_1_data_testid_value = testId(`${/*className*/ ctx[1]}-mark`)
    		}
    	];

    	let text_1_data = {};

    	for (let i = 0; i < text_1_levels.length; i += 1) {
    		text_1_data = assign(text_1_data, text_1_levels[i]);
    	}

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			text_1 = svg_element("text");
    			t = text(t_value);
    			set_svg_attributes(text_1, text_1_data);
    			this.first = text_1;
    		},
    		m(target, anchor) {
    			insert(target, text_1, anchor);
    			append(text_1, t);
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty[0] & /*svgData*/ 16 && t_value !== (t_value = /*mark*/ ctx[49].text + "")) set_data(t, t_value);

    			set_svg_attributes(text_1, text_1_data = get_spread_update(text_1_levels, [
    				dirty[0] & /*svgData*/ 16 && /*mark*/ ctx[49],
    				{ text: undefined },
    				dirty[0] & /*className*/ 2 && text_1_data_testid_value !== (text_1_data_testid_value = testId(`${/*className*/ ctx[1]}-mark`)) && { "data-testid": text_1_data_testid_value }
    			]));
    		},
    		d(detaching) {
    			if (detaching) detach(text_1);
    		}
    	};
    }

    // (287:0) {#if renderer === 'canvas'}
    function create_if_block$3(ctx) {
    	let t;

    	return {
    		c() {
    			t = text(/*id*/ ctx[9]);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p: noop$1,
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    function create_fragment$6(ctx) {
    	let t;
    	let if_block1_anchor;
    	let if_block0 = /*renderer*/ ctx[5] === 'svg' && create_if_block_1$2(ctx);
    	let if_block1 = /*renderer*/ ctx[5] === 'canvas' && create_if_block$3(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*renderer*/ ctx[5] === 'svg') if_block0.p(ctx, dirty);
    			if (/*renderer*/ ctx[5] === 'canvas') if_block1.p(ctx, dirty);
    		},
    		i: noop$1,
    		o: noop$1,
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    		}
    	};
    }

    let layerId = 0;
    const getId = () => 'l' + layerId++;

    function instance$6($$self, $$props, $$invalidate) {
    	let primaryInput;
    	let isInteractiveMouse;
    	let isInteractiveTouch;
    	let isSelectable;
    	let $interactionManager;
    	let $globalBlockReindexing;
    	let $section;
    	let { positioning } = $$props;
    	let { aesthetics } = $$props;
    	let { createLayer } = $$props;
    	let { parseAesthetics } = $$props;
    	let { className } = $$props;
    	let { element = 'path' } = $$props;
    	let { outputSettings = undefined } = $$props;
    	let { blockReindexing = undefined } = $$props;
    	let { onClick = undefined } = $$props;
    	let { onMousedown = undefined } = $$props;
    	let { onMouseup = undefined } = $$props;
    	let { onMouseover = undefined } = $$props;
    	let { onMouseout = undefined } = $$props;
    	let { onMousedrag = undefined } = $$props;
    	let { onTouchdown = undefined } = $$props;
    	let { onTouchup = undefined } = $$props;
    	let { onTouchover = undefined } = $$props;
    	let { onTouchout = undefined } = $$props;
    	let { onTouchdrag = undefined } = $$props;
    	let { onSelect = undefined } = $$props;
    	let { onDeselect = undefined } = $$props;

    	// Get parent contexts
    	const { renderer, marksAndLayers, dirty, globalBlockReindexing } = getContext('graphic');

    	component_subscribe($$self, globalBlockReindexing, value => $$invalidate(39, $globalBlockReindexing = value));
    	const section = getContext('section');
    	component_subscribe($$self, section, value => $$invalidate(3, $section = value));
    	const interactionManager = getContext('interactionManager');
    	component_subscribe($$self, interactionManager, value => $$invalidate(33, $interactionManager = value));
    	const id = getId();

    	const createSVGContext = element === 'path'
    	? svgStyled.pathLayer
    	: svgStyled.textLayer;

    	// Init
    	let mounted;

    	onMount(() => {
    		mounted = true;

    		if (renderer === 'canvas') {
    			dirty.set(true);
    		}

    		updateInteractionManagerIfNecessary();
    	});

    	const isMounted = () => mounted;
    	let layer = create();
    	marksAndLayers[id] = layer;

    	function create() {
    		let _layer = createLayer(merge(positioning, aesthetics), $section, outputSettings);
    		_layer.id = id;
    		return _layer;
    	}

    	let svgContext;
    	let svgData;

    	if (renderer === 'svg') {
    		svgContext = createSVGContext();
    		layer.render(svgContext);
    		svgData = svgContext.result();
    	}

    	// Handling of updates
    	let updatePositioning = false;

    	let updateAesthetics = false;

    	function scheduleUpdatePositioning() {
    		if (isMounted()) {
    			$$invalidate(30, updatePositioning = true);
    		}
    	}

    	function scheduleUpdateAesthetics() {
    		if (isMounted()) {
    			$$invalidate(31, updateAesthetics = true);
    		}
    	}

    	function updateInteractionManagerIfNecessary() {
    		if (blockReindexing === undefined) {
    			if ($globalBlockReindexing) return;
    		} else {
    			if (blockReindexing === true) return;
    		}

    		if (isInteractiveMouse || isInteractiveTouch) {
    			removeLayerFromSpatialIndexIfNecessary();

    			if (isInteractiveMouse) {
    				const markInterface = $interactionManager.mouse().marks();
    				markInterface.loadLayer(layer);
    				if (onClick) markInterface.addLayerInteraction('click', layer, onClick);
    				if (onMousedown) markInterface.addLayerInteraction('mousedown', layer, onMousedown);
    				if (onMouseup) markInterface.addLayerInteraction('mouseup', layer, onMouseup);
    				if (onMouseout) markInterface.addLayerInteraction('mouseout', layer, onMouseout);
    				if (onMouseover) markInterface.addLayerInteraction('mouseover', layer, onMouseover);
    				if (onMousedrag) markInterface.addLayerInteraction('mousedrag', layer, onMousedrag);
    			}

    			if (isInteractiveTouch) {
    				const markInterface = $interactionManager.touch().marks();
    				markInterface.loadLayer(layer);
    				if (onTouchdown) markInterface.addLayerInteraction('touchdown', layer, onTouchdown);
    				if (onTouchup) markInterface.addLayerInteraction('touchup', layer, onTouchup);
    				if (onTouchover) markInterface.addLayerInteraction('touchover', layer, onTouchover);
    				if (onTouchout) markInterface.addLayerInteraction('touchout', layer, onTouchout);
    				if (onTouchdrag) markInterface.addLayerInteraction('touchdrag', layer, onTouchdrag);
    			}
    		}

    		removeLayerFromSelectIfNecessary();

    		if (isSelectable) {
    			const selectManager = $interactionManager.select();
    			selectManager.loadLayer(layer, { onSelect, onDeselect });
    		}
    	}

    	function removeLayerFromSpatialIndexIfNecessary() {
    		if (primaryInput === 'mouse') {
    			const markMouseInterface = $interactionManager.mouse().marks();

    			if (markMouseInterface.layerIsLoaded(layer)) {
    				markMouseInterface.removeAllLayerInteractions(layer);
    				markMouseInterface.removeLayer(layer);
    			}
    		}

    		if (primaryInput === 'touch') {
    			const markTouchInterface = $interactionManager.touch().marks();

    			if (markTouchInterface.layerIsLoaded(layer)) {
    				markTouchInterface.removeAllLayerInteractions(layer);
    				markTouchInterface.removeLayer(layer);
    			}
    		}
    	}

    	function removeLayerFromSelectIfNecessary() {
    		const selectManager = $interactionManager.select();

    		if (selectManager.layerIsLoaded(layer)) {
    			selectManager.removeLayer(layer);
    		}
    	}

    	onDestroy(() => {
    		if (renderer === 'canvas') {
    			delete marksAndLayers[id];
    			dirty.set(true);
    		}
    	});

    	$$self.$$set = $$props => {
    		if ('positioning' in $$props) $$invalidate(10, positioning = $$props.positioning);
    		if ('aesthetics' in $$props) $$invalidate(0, aesthetics = $$props.aesthetics);
    		if ('createLayer' in $$props) $$invalidate(11, createLayer = $$props.createLayer);
    		if ('parseAesthetics' in $$props) $$invalidate(12, parseAesthetics = $$props.parseAesthetics);
    		if ('className' in $$props) $$invalidate(1, className = $$props.className);
    		if ('element' in $$props) $$invalidate(2, element = $$props.element);
    		if ('outputSettings' in $$props) $$invalidate(13, outputSettings = $$props.outputSettings);
    		if ('blockReindexing' in $$props) $$invalidate(14, blockReindexing = $$props.blockReindexing);
    		if ('onClick' in $$props) $$invalidate(15, onClick = $$props.onClick);
    		if ('onMousedown' in $$props) $$invalidate(16, onMousedown = $$props.onMousedown);
    		if ('onMouseup' in $$props) $$invalidate(17, onMouseup = $$props.onMouseup);
    		if ('onMouseover' in $$props) $$invalidate(18, onMouseover = $$props.onMouseover);
    		if ('onMouseout' in $$props) $$invalidate(19, onMouseout = $$props.onMouseout);
    		if ('onMousedrag' in $$props) $$invalidate(20, onMousedrag = $$props.onMousedrag);
    		if ('onTouchdown' in $$props) $$invalidate(21, onTouchdown = $$props.onTouchdown);
    		if ('onTouchup' in $$props) $$invalidate(22, onTouchup = $$props.onTouchup);
    		if ('onTouchover' in $$props) $$invalidate(23, onTouchover = $$props.onTouchover);
    		if ('onTouchout' in $$props) $$invalidate(24, onTouchout = $$props.onTouchout);
    		if ('onTouchdrag' in $$props) $$invalidate(25, onTouchdrag = $$props.onTouchdrag);
    		if ('onSelect' in $$props) $$invalidate(26, onSelect = $$props.onSelect);
    		if ('onDeselect' in $$props) $$invalidate(27, onDeselect = $$props.onDeselect);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*positioning*/ 1024) {
    			{
    				if (positioning) {
    					scheduleUpdatePositioning();
    				}
    			}
    		}

    		if ($$self.$$.dirty[0] & /*aesthetics*/ 1) {
    			{
    				if (aesthetics) {
    					scheduleUpdateAesthetics();
    				}
    			}
    		}

    		if ($$self.$$.dirty[0] & /*$section, outputSettings*/ 8200) {
    			{
    				if ($section || outputSettings) {
    					scheduleUpdatePositioning();
    				}
    			}
    		}

    		if ($$self.$$.dirty[0] & /*updatePositioning, layer, svgContext, parseAesthetics, aesthetics*/ 1879052289 | $$self.$$.dirty[1] & /*updateAesthetics*/ 1) {
    			{
    				if (updatePositioning) {
    					$$invalidate(28, layer = create());

    					if (renderer === 'svg') {
    						$$invalidate(29, svgContext = createSVGContext());
    						layer.render(svgContext);
    						$$invalidate(4, svgData = svgContext.result());
    					}

    					if (renderer === 'canvas') {
    						marksAndLayers[id] = layer;
    						dirty.set(true);
    					}

    					updateInteractionManagerIfNecessary();
    				}

    				if (!updatePositioning && updateAesthetics) {
    					const parsedAesthetics = parseAesthetics(aesthetics);
    					const strokeWidthChanged = layer.props.strokeWidth !== parsedAesthetics.strokeWidth;
    					const clipChanged = layer.props.clip !== parsedAesthetics.clip;
    					layer.updateAesthetics(parsedAesthetics);

    					if (strokeWidthChanged || clipChanged) {
    						updateInteractionManagerIfNecessary();
    					}

    					if (renderer === 'svg') {
    						$$invalidate(29, svgContext = createSVGContext());
    						layer.render(svgContext);
    						$$invalidate(4, svgData = svgContext.result());
    					}

    					if (renderer === 'canvas') {
    						dirty.set(true);
    					}
    				}

    				$$invalidate(30, updatePositioning = false);
    				$$invalidate(31, updateAesthetics = false);
    			}
    		}

    		if ($$self.$$.dirty[1] & /*$interactionManager*/ 4) {
    			// Interactivity
    			$$invalidate(32, primaryInput = $interactionManager.getPrimaryInput());
    		}

    		if ($$self.$$.dirty[0] & /*onClick, onMousedown, onMouseup, onMouseover, onMouseout, onMousedrag*/ 2064384 | $$self.$$.dirty[1] & /*primaryInput*/ 2) {
    			isInteractiveMouse = primaryInput === 'mouse' && any(onClick, onMousedown, onMouseup, onMouseover, onMouseout, onMousedrag);
    		}

    		if ($$self.$$.dirty[0] & /*onTouchdown, onTouchup, onTouchover, onTouchout, onTouchdrag*/ 65011712 | $$self.$$.dirty[1] & /*primaryInput*/ 2) {
    			isInteractiveTouch = primaryInput === 'touch' && any(onTouchdown, onTouchup, onTouchover, onTouchout, onTouchdrag);
    		}

    		if ($$self.$$.dirty[0] & /*onSelect, onDeselect*/ 201326592) {
    			isSelectable = any(onSelect, onDeselect);
    		}
    	};

    	return [
    		aesthetics,
    		className,
    		element,
    		$section,
    		svgData,
    		renderer,
    		globalBlockReindexing,
    		section,
    		interactionManager,
    		id,
    		positioning,
    		createLayer,
    		parseAesthetics,
    		outputSettings,
    		blockReindexing,
    		onClick,
    		onMousedown,
    		onMouseup,
    		onMouseover,
    		onMouseout,
    		onMousedrag,
    		onTouchdown,
    		onTouchup,
    		onTouchover,
    		onTouchout,
    		onTouchdrag,
    		onSelect,
    		onDeselect,
    		layer,
    		svgContext,
    		updatePositioning,
    		updateAesthetics,
    		primaryInput,
    		$interactionManager
    	];
    }

    class Layer extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$6,
    			create_fragment$6,
    			safe_not_equal,
    			{
    				positioning: 10,
    				aesthetics: 0,
    				createLayer: 11,
    				parseAesthetics: 12,
    				className: 1,
    				element: 2,
    				outputSettings: 13,
    				blockReindexing: 14,
    				onClick: 15,
    				onMousedown: 16,
    				onMouseup: 17,
    				onMouseover: 18,
    				onMouseout: 19,
    				onMousedrag: 20,
    				onTouchdown: 21,
    				onTouchup: 22,
    				onTouchover: 23,
    				onTouchout: 24,
    				onTouchdrag: 25,
    				onSelect: 26,
    				onDeselect: 27
    			},
    			null,
    			[-1, -1]
    		);
    	}
    }

    /* node_modules/@snlab/florence/src/components/marks/point/PointLayer.svelte generated by Svelte v3.49.0 */

    function create_fragment$5(ctx) {
    	let layer;
    	let current;

    	layer = new Layer({
    			props: {
    				positioning: /*positioning*/ ctx[16],
    				aesthetics: /*aesthetics*/ ctx[15],
    				createLayer: createPointLayer,
    				parseAesthetics: parseAestheticsPointLayer,
    				className: "point-layer",
    				outputSettings: /*outputSettings*/ ctx[0],
    				blockReindexing: /*blockReindexing*/ ctx[1],
    				onClick: /*onClick*/ ctx[2],
    				onMousedown: /*onMousedown*/ ctx[3],
    				onMouseup: /*onMouseup*/ ctx[4],
    				onMouseover: /*onMouseover*/ ctx[5],
    				onMouseout: /*onMouseout*/ ctx[6],
    				onMousedrag: /*onMousedrag*/ ctx[7],
    				onTouchdown: /*onTouchdown*/ ctx[8],
    				onTouchup: /*onTouchup*/ ctx[9],
    				onTouchover: /*onTouchover*/ ctx[10],
    				onTouchout: /*onTouchout*/ ctx[11],
    				onTouchdrag: /*onTouchdrag*/ ctx[12],
    				onSelect: /*onSelect*/ ctx[13],
    				onDeselect: /*onDeselect*/ ctx[14]
    			}
    		});

    	return {
    		c() {
    			create_component(layer.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(layer, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const layer_changes = {};
    			if (dirty[0] & /*positioning*/ 65536) layer_changes.positioning = /*positioning*/ ctx[16];
    			if (dirty[0] & /*aesthetics*/ 32768) layer_changes.aesthetics = /*aesthetics*/ ctx[15];
    			if (dirty[0] & /*outputSettings*/ 1) layer_changes.outputSettings = /*outputSettings*/ ctx[0];
    			if (dirty[0] & /*blockReindexing*/ 2) layer_changes.blockReindexing = /*blockReindexing*/ ctx[1];
    			if (dirty[0] & /*onClick*/ 4) layer_changes.onClick = /*onClick*/ ctx[2];
    			if (dirty[0] & /*onMousedown*/ 8) layer_changes.onMousedown = /*onMousedown*/ ctx[3];
    			if (dirty[0] & /*onMouseup*/ 16) layer_changes.onMouseup = /*onMouseup*/ ctx[4];
    			if (dirty[0] & /*onMouseover*/ 32) layer_changes.onMouseover = /*onMouseover*/ ctx[5];
    			if (dirty[0] & /*onMouseout*/ 64) layer_changes.onMouseout = /*onMouseout*/ ctx[6];
    			if (dirty[0] & /*onMousedrag*/ 128) layer_changes.onMousedrag = /*onMousedrag*/ ctx[7];
    			if (dirty[0] & /*onTouchdown*/ 256) layer_changes.onTouchdown = /*onTouchdown*/ ctx[8];
    			if (dirty[0] & /*onTouchup*/ 512) layer_changes.onTouchup = /*onTouchup*/ ctx[9];
    			if (dirty[0] & /*onTouchover*/ 1024) layer_changes.onTouchover = /*onTouchover*/ ctx[10];
    			if (dirty[0] & /*onTouchout*/ 2048) layer_changes.onTouchout = /*onTouchout*/ ctx[11];
    			if (dirty[0] & /*onTouchdrag*/ 4096) layer_changes.onTouchdrag = /*onTouchdrag*/ ctx[12];
    			if (dirty[0] & /*onSelect*/ 8192) layer_changes.onSelect = /*onSelect*/ ctx[13];
    			if (dirty[0] & /*onDeselect*/ 16384) layer_changes.onDeselect = /*onDeselect*/ ctx[14];
    			layer.$set(layer_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(layer.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(layer.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(layer, detaching);
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let positioning;
    	let aesthetics;
    	let { x = undefined } = $$props;
    	let { y = undefined } = $$props;
    	let { geometry = undefined } = $$props;
    	let { radius = undefined } = $$props;
    	let { fill = undefined } = $$props;
    	let { stroke = undefined } = $$props;
    	let { strokeWidth = undefined } = $$props;
    	let { strokeOpacity = undefined } = $$props;
    	let { fillOpacity = undefined } = $$props;
    	let { opacity = undefined } = $$props;
    	let { lineCap = undefined } = $$props;
    	let { dashArray = undefined } = $$props;
    	let { dashOffset = undefined } = $$props;
    	let { outputSettings = undefined } = $$props;
    	let { clip = undefined } = $$props;
    	let { keys = undefined } = $$props;
    	let { asOnePath = undefined } = $$props;
    	let { blockReindexing = undefined } = $$props;
    	let { onClick = undefined } = $$props;
    	let { onMousedown = undefined } = $$props;
    	let { onMouseup = undefined } = $$props;
    	let { onMouseover = undefined } = $$props;
    	let { onMouseout = undefined } = $$props;
    	let { onMousedrag = undefined } = $$props;
    	let { onTouchdown = undefined } = $$props;
    	let { onTouchup = undefined } = $$props;
    	let { onTouchover = undefined } = $$props;
    	let { onTouchout = undefined } = $$props;
    	let { onTouchdrag = undefined } = $$props;
    	let { onSelect = undefined } = $$props;
    	let { onDeselect = undefined } = $$props;

    	$$self.$$set = $$props => {
    		if ('x' in $$props) $$invalidate(17, x = $$props.x);
    		if ('y' in $$props) $$invalidate(18, y = $$props.y);
    		if ('geometry' in $$props) $$invalidate(19, geometry = $$props.geometry);
    		if ('radius' in $$props) $$invalidate(20, radius = $$props.radius);
    		if ('fill' in $$props) $$invalidate(21, fill = $$props.fill);
    		if ('stroke' in $$props) $$invalidate(22, stroke = $$props.stroke);
    		if ('strokeWidth' in $$props) $$invalidate(23, strokeWidth = $$props.strokeWidth);
    		if ('strokeOpacity' in $$props) $$invalidate(24, strokeOpacity = $$props.strokeOpacity);
    		if ('fillOpacity' in $$props) $$invalidate(25, fillOpacity = $$props.fillOpacity);
    		if ('opacity' in $$props) $$invalidate(26, opacity = $$props.opacity);
    		if ('lineCap' in $$props) $$invalidate(27, lineCap = $$props.lineCap);
    		if ('dashArray' in $$props) $$invalidate(28, dashArray = $$props.dashArray);
    		if ('dashOffset' in $$props) $$invalidate(29, dashOffset = $$props.dashOffset);
    		if ('outputSettings' in $$props) $$invalidate(0, outputSettings = $$props.outputSettings);
    		if ('clip' in $$props) $$invalidate(30, clip = $$props.clip);
    		if ('keys' in $$props) $$invalidate(31, keys = $$props.keys);
    		if ('asOnePath' in $$props) $$invalidate(32, asOnePath = $$props.asOnePath);
    		if ('blockReindexing' in $$props) $$invalidate(1, blockReindexing = $$props.blockReindexing);
    		if ('onClick' in $$props) $$invalidate(2, onClick = $$props.onClick);
    		if ('onMousedown' in $$props) $$invalidate(3, onMousedown = $$props.onMousedown);
    		if ('onMouseup' in $$props) $$invalidate(4, onMouseup = $$props.onMouseup);
    		if ('onMouseover' in $$props) $$invalidate(5, onMouseover = $$props.onMouseover);
    		if ('onMouseout' in $$props) $$invalidate(6, onMouseout = $$props.onMouseout);
    		if ('onMousedrag' in $$props) $$invalidate(7, onMousedrag = $$props.onMousedrag);
    		if ('onTouchdown' in $$props) $$invalidate(8, onTouchdown = $$props.onTouchdown);
    		if ('onTouchup' in $$props) $$invalidate(9, onTouchup = $$props.onTouchup);
    		if ('onTouchover' in $$props) $$invalidate(10, onTouchover = $$props.onTouchover);
    		if ('onTouchout' in $$props) $$invalidate(11, onTouchout = $$props.onTouchout);
    		if ('onTouchdrag' in $$props) $$invalidate(12, onTouchdrag = $$props.onTouchdrag);
    		if ('onSelect' in $$props) $$invalidate(13, onSelect = $$props.onSelect);
    		if ('onDeselect' in $$props) $$invalidate(14, onDeselect = $$props.onDeselect);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*x, y, geometry, radius*/ 1966080) {
    			$$invalidate(16, positioning = { x, y, geometry, radius });
    		}

    		if ($$self.$$.dirty[0] & /*fill, stroke, strokeWidth, strokeOpacity, fillOpacity, opacity, lineCap, dashArray, dashOffset, clip*/ 2145386496 | $$self.$$.dirty[1] & /*keys, asOnePath*/ 3) {
    			$$invalidate(15, aesthetics = {
    				fill,
    				stroke,
    				strokeWidth,
    				strokeOpacity,
    				fillOpacity,
    				opacity,
    				lineCap,
    				dashArray,
    				dashOffset,
    				clip,
    				keys,
    				asOnePath
    			});
    		}
    	};

    	return [
    		outputSettings,
    		blockReindexing,
    		onClick,
    		onMousedown,
    		onMouseup,
    		onMouseover,
    		onMouseout,
    		onMousedrag,
    		onTouchdown,
    		onTouchup,
    		onTouchover,
    		onTouchout,
    		onTouchdrag,
    		onSelect,
    		onDeselect,
    		aesthetics,
    		positioning,
    		x,
    		y,
    		geometry,
    		radius,
    		fill,
    		stroke,
    		strokeWidth,
    		strokeOpacity,
    		fillOpacity,
    		opacity,
    		lineCap,
    		dashArray,
    		dashOffset,
    		clip,
    		keys,
    		asOnePath
    	];
    }

    class PointLayer extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$5,
    			create_fragment$5,
    			safe_not_equal,
    			{
    				x: 17,
    				y: 18,
    				geometry: 19,
    				radius: 20,
    				fill: 21,
    				stroke: 22,
    				strokeWidth: 23,
    				strokeOpacity: 24,
    				fillOpacity: 25,
    				opacity: 26,
    				lineCap: 27,
    				dashArray: 28,
    				dashOffset: 29,
    				outputSettings: 0,
    				clip: 30,
    				keys: 31,
    				asOnePath: 32,
    				blockReindexing: 1,
    				onClick: 2,
    				onMousedown: 3,
    				onMouseup: 4,
    				onMouseover: 5,
    				onMouseout: 6,
    				onMousedrag: 7,
    				onTouchdown: 8,
    				onTouchup: 9,
    				onTouchover: 10,
    				onTouchout: 11,
    				onTouchdrag: 12,
    				onSelect: 13,
    				onDeselect: 14
    			},
    			null,
    			[-1, -1]
    		);
    	}
    }

    /* node_modules/@snlab/florence/src/components/marks/line/LineLayer.svelte generated by Svelte v3.49.0 */

    function create_fragment$4(ctx) {
    	let layer;
    	let current;

    	layer = new Layer({
    			props: {
    				positioning: /*positioning*/ ctx[16],
    				aesthetics: /*aesthetics*/ ctx[15],
    				createLayer: createLineLayer,
    				parseAesthetics: parseAestheticsLineLayer,
    				className: "line-layer",
    				outputSettings: /*outputSettings*/ ctx[0],
    				blockReindexing: /*blockReindexing*/ ctx[1],
    				onClick: /*onClick*/ ctx[2],
    				onMousedown: /*onMousedown*/ ctx[3],
    				onMouseup: /*onMouseup*/ ctx[4],
    				onMouseover: /*onMouseover*/ ctx[5],
    				onMouseout: /*onMouseout*/ ctx[6],
    				onMousedrag: /*onMousedrag*/ ctx[7],
    				onTouchdown: /*onTouchdown*/ ctx[8],
    				onTouchup: /*onTouchup*/ ctx[9],
    				onTouchover: /*onTouchover*/ ctx[10],
    				onTouchout: /*onTouchout*/ ctx[11],
    				onTouchdrag: /*onTouchdrag*/ ctx[12],
    				onSelect: /*onSelect*/ ctx[13],
    				onDeselect: /*onDeselect*/ ctx[14]
    			}
    		});

    	return {
    		c() {
    			create_component(layer.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(layer, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const layer_changes = {};
    			if (dirty[0] & /*positioning*/ 65536) layer_changes.positioning = /*positioning*/ ctx[16];
    			if (dirty[0] & /*aesthetics*/ 32768) layer_changes.aesthetics = /*aesthetics*/ ctx[15];
    			if (dirty[0] & /*outputSettings*/ 1) layer_changes.outputSettings = /*outputSettings*/ ctx[0];
    			if (dirty[0] & /*blockReindexing*/ 2) layer_changes.blockReindexing = /*blockReindexing*/ ctx[1];
    			if (dirty[0] & /*onClick*/ 4) layer_changes.onClick = /*onClick*/ ctx[2];
    			if (dirty[0] & /*onMousedown*/ 8) layer_changes.onMousedown = /*onMousedown*/ ctx[3];
    			if (dirty[0] & /*onMouseup*/ 16) layer_changes.onMouseup = /*onMouseup*/ ctx[4];
    			if (dirty[0] & /*onMouseover*/ 32) layer_changes.onMouseover = /*onMouseover*/ ctx[5];
    			if (dirty[0] & /*onMouseout*/ 64) layer_changes.onMouseout = /*onMouseout*/ ctx[6];
    			if (dirty[0] & /*onMousedrag*/ 128) layer_changes.onMousedrag = /*onMousedrag*/ ctx[7];
    			if (dirty[0] & /*onTouchdown*/ 256) layer_changes.onTouchdown = /*onTouchdown*/ ctx[8];
    			if (dirty[0] & /*onTouchup*/ 512) layer_changes.onTouchup = /*onTouchup*/ ctx[9];
    			if (dirty[0] & /*onTouchover*/ 1024) layer_changes.onTouchover = /*onTouchover*/ ctx[10];
    			if (dirty[0] & /*onTouchout*/ 2048) layer_changes.onTouchout = /*onTouchout*/ ctx[11];
    			if (dirty[0] & /*onTouchdrag*/ 4096) layer_changes.onTouchdrag = /*onTouchdrag*/ ctx[12];
    			if (dirty[0] & /*onSelect*/ 8192) layer_changes.onSelect = /*onSelect*/ ctx[13];
    			if (dirty[0] & /*onDeselect*/ 16384) layer_changes.onDeselect = /*onDeselect*/ ctx[14];
    			layer.$set(layer_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(layer.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(layer.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(layer, detaching);
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let positioning;
    	let aesthetics;
    	let { x = undefined } = $$props;
    	let { y = undefined } = $$props;
    	let { geometry = undefined } = $$props;
    	let { curve = undefined } = $$props;
    	let { _resampleIntervals = undefined } = $$props;
    	let { stroke = undefined } = $$props;
    	let { strokeWidth = undefined } = $$props;
    	let { opacity = undefined } = $$props;
    	let { lineCap = undefined } = $$props;
    	let { lineJoin = undefined } = $$props;
    	let { miterLimit = undefined } = $$props;
    	let { dashArray = undefined } = $$props;
    	let { dashOffset = undefined } = $$props;
    	let { outputSettings = undefined } = $$props;
    	let { clip = undefined } = $$props;
    	let { keys = undefined } = $$props;
    	let { asOnePath = undefined } = $$props;
    	let { blockReindexing = undefined } = $$props;
    	let { onClick = undefined } = $$props;
    	let { onMousedown = undefined } = $$props;
    	let { onMouseup = undefined } = $$props;
    	let { onMouseover = undefined } = $$props;
    	let { onMouseout = undefined } = $$props;
    	let { onMousedrag = undefined } = $$props;
    	let { onTouchdown = undefined } = $$props;
    	let { onTouchup = undefined } = $$props;
    	let { onTouchover = undefined } = $$props;
    	let { onTouchout = undefined } = $$props;
    	let { onTouchdrag = undefined } = $$props;
    	let { onSelect = undefined } = $$props;
    	let { onDeselect = undefined } = $$props;

    	$$self.$$set = $$props => {
    		if ('x' in $$props) $$invalidate(17, x = $$props.x);
    		if ('y' in $$props) $$invalidate(18, y = $$props.y);
    		if ('geometry' in $$props) $$invalidate(19, geometry = $$props.geometry);
    		if ('curve' in $$props) $$invalidate(20, curve = $$props.curve);
    		if ('_resampleIntervals' in $$props) $$invalidate(21, _resampleIntervals = $$props._resampleIntervals);
    		if ('stroke' in $$props) $$invalidate(22, stroke = $$props.stroke);
    		if ('strokeWidth' in $$props) $$invalidate(23, strokeWidth = $$props.strokeWidth);
    		if ('opacity' in $$props) $$invalidate(24, opacity = $$props.opacity);
    		if ('lineCap' in $$props) $$invalidate(25, lineCap = $$props.lineCap);
    		if ('lineJoin' in $$props) $$invalidate(26, lineJoin = $$props.lineJoin);
    		if ('miterLimit' in $$props) $$invalidate(27, miterLimit = $$props.miterLimit);
    		if ('dashArray' in $$props) $$invalidate(28, dashArray = $$props.dashArray);
    		if ('dashOffset' in $$props) $$invalidate(29, dashOffset = $$props.dashOffset);
    		if ('outputSettings' in $$props) $$invalidate(0, outputSettings = $$props.outputSettings);
    		if ('clip' in $$props) $$invalidate(30, clip = $$props.clip);
    		if ('keys' in $$props) $$invalidate(31, keys = $$props.keys);
    		if ('asOnePath' in $$props) $$invalidate(32, asOnePath = $$props.asOnePath);
    		if ('blockReindexing' in $$props) $$invalidate(1, blockReindexing = $$props.blockReindexing);
    		if ('onClick' in $$props) $$invalidate(2, onClick = $$props.onClick);
    		if ('onMousedown' in $$props) $$invalidate(3, onMousedown = $$props.onMousedown);
    		if ('onMouseup' in $$props) $$invalidate(4, onMouseup = $$props.onMouseup);
    		if ('onMouseover' in $$props) $$invalidate(5, onMouseover = $$props.onMouseover);
    		if ('onMouseout' in $$props) $$invalidate(6, onMouseout = $$props.onMouseout);
    		if ('onMousedrag' in $$props) $$invalidate(7, onMousedrag = $$props.onMousedrag);
    		if ('onTouchdown' in $$props) $$invalidate(8, onTouchdown = $$props.onTouchdown);
    		if ('onTouchup' in $$props) $$invalidate(9, onTouchup = $$props.onTouchup);
    		if ('onTouchover' in $$props) $$invalidate(10, onTouchover = $$props.onTouchover);
    		if ('onTouchout' in $$props) $$invalidate(11, onTouchout = $$props.onTouchout);
    		if ('onTouchdrag' in $$props) $$invalidate(12, onTouchdrag = $$props.onTouchdrag);
    		if ('onSelect' in $$props) $$invalidate(13, onSelect = $$props.onSelect);
    		if ('onDeselect' in $$props) $$invalidate(14, onDeselect = $$props.onDeselect);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*x, y, geometry, curve, _resampleIntervals*/ 4063232) {
    			$$invalidate(16, positioning = {
    				x,
    				y,
    				geometry,
    				curve,
    				_resampleIntervals
    			});
    		}

    		if ($$self.$$.dirty[0] & /*stroke, strokeWidth, opacity, lineCap, dashArray, lineJoin, miterLimit, dashOffset, clip*/ 2143289344 | $$self.$$.dirty[1] & /*keys, asOnePath*/ 3) {
    			$$invalidate(15, aesthetics = {
    				stroke,
    				strokeWidth,
    				opacity,
    				lineCap,
    				dashArray,
    				lineJoin,
    				miterLimit,
    				dashOffset,
    				clip,
    				keys,
    				asOnePath
    			});
    		}
    	};

    	return [
    		outputSettings,
    		blockReindexing,
    		onClick,
    		onMousedown,
    		onMouseup,
    		onMouseover,
    		onMouseout,
    		onMousedrag,
    		onTouchdown,
    		onTouchup,
    		onTouchover,
    		onTouchout,
    		onTouchdrag,
    		onSelect,
    		onDeselect,
    		aesthetics,
    		positioning,
    		x,
    		y,
    		geometry,
    		curve,
    		_resampleIntervals,
    		stroke,
    		strokeWidth,
    		opacity,
    		lineCap,
    		lineJoin,
    		miterLimit,
    		dashArray,
    		dashOffset,
    		clip,
    		keys,
    		asOnePath
    	];
    }

    class LineLayer extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$4,
    			create_fragment$4,
    			safe_not_equal,
    			{
    				x: 17,
    				y: 18,
    				geometry: 19,
    				curve: 20,
    				_resampleIntervals: 21,
    				stroke: 22,
    				strokeWidth: 23,
    				opacity: 24,
    				lineCap: 25,
    				lineJoin: 26,
    				miterLimit: 27,
    				dashArray: 28,
    				dashOffset: 29,
    				outputSettings: 0,
    				clip: 30,
    				keys: 31,
    				asOnePath: 32,
    				blockReindexing: 1,
    				onClick: 2,
    				onMousedown: 3,
    				onMouseup: 4,
    				onMouseover: 5,
    				onMouseout: 6,
    				onMousedrag: 7,
    				onTouchdown: 8,
    				onTouchup: 9,
    				onTouchover: 10,
    				onTouchout: 11,
    				onTouchdrag: 12,
    				onSelect: 13,
    				onDeselect: 14
    			},
    			null,
    			[-1, -1]
    		);
    	}
    }

    /* node_modules/@snlab/florence/src/components/marks/label/LabelLayer.svelte generated by Svelte v3.49.0 */

    function create_fragment$3(ctx) {
    	let layer;
    	let current;

    	layer = new Layer({
    			props: {
    				positioning: /*positioning*/ ctx[16],
    				aesthetics: /*aesthetics*/ ctx[15],
    				createLayer: createLabelLayer,
    				parseAesthetics: parseAestheticsLabelLayer,
    				className: "label-layer",
    				element: "text",
    				outputSettings: /*outputSettings*/ ctx[0],
    				blockReindexing: /*blockReindexing*/ ctx[1],
    				onClick: /*onClick*/ ctx[2],
    				onMousedown: /*onMousedown*/ ctx[3],
    				onMouseup: /*onMouseup*/ ctx[4],
    				onMouseover: /*onMouseover*/ ctx[5],
    				onMouseout: /*onMouseout*/ ctx[6],
    				onMousedrag: /*onMousedrag*/ ctx[7],
    				onTouchdown: /*onTouchdown*/ ctx[8],
    				onTouchup: /*onTouchup*/ ctx[9],
    				onTouchover: /*onTouchover*/ ctx[10],
    				onTouchout: /*onTouchout*/ ctx[11],
    				onTouchdrag: /*onTouchdrag*/ ctx[12],
    				onSelect: /*onSelect*/ ctx[13],
    				onDeselect: /*onDeselect*/ ctx[14]
    			}
    		});

    	return {
    		c() {
    			create_component(layer.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(layer, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const layer_changes = {};
    			if (dirty[0] & /*positioning*/ 65536) layer_changes.positioning = /*positioning*/ ctx[16];
    			if (dirty[0] & /*aesthetics*/ 32768) layer_changes.aesthetics = /*aesthetics*/ ctx[15];
    			if (dirty[0] & /*outputSettings*/ 1) layer_changes.outputSettings = /*outputSettings*/ ctx[0];
    			if (dirty[0] & /*blockReindexing*/ 2) layer_changes.blockReindexing = /*blockReindexing*/ ctx[1];
    			if (dirty[0] & /*onClick*/ 4) layer_changes.onClick = /*onClick*/ ctx[2];
    			if (dirty[0] & /*onMousedown*/ 8) layer_changes.onMousedown = /*onMousedown*/ ctx[3];
    			if (dirty[0] & /*onMouseup*/ 16) layer_changes.onMouseup = /*onMouseup*/ ctx[4];
    			if (dirty[0] & /*onMouseover*/ 32) layer_changes.onMouseover = /*onMouseover*/ ctx[5];
    			if (dirty[0] & /*onMouseout*/ 64) layer_changes.onMouseout = /*onMouseout*/ ctx[6];
    			if (dirty[0] & /*onMousedrag*/ 128) layer_changes.onMousedrag = /*onMousedrag*/ ctx[7];
    			if (dirty[0] & /*onTouchdown*/ 256) layer_changes.onTouchdown = /*onTouchdown*/ ctx[8];
    			if (dirty[0] & /*onTouchup*/ 512) layer_changes.onTouchup = /*onTouchup*/ ctx[9];
    			if (dirty[0] & /*onTouchover*/ 1024) layer_changes.onTouchover = /*onTouchover*/ ctx[10];
    			if (dirty[0] & /*onTouchout*/ 2048) layer_changes.onTouchout = /*onTouchout*/ ctx[11];
    			if (dirty[0] & /*onTouchdrag*/ 4096) layer_changes.onTouchdrag = /*onTouchdrag*/ ctx[12];
    			if (dirty[0] & /*onSelect*/ 8192) layer_changes.onSelect = /*onSelect*/ ctx[13];
    			if (dirty[0] & /*onDeselect*/ 16384) layer_changes.onDeselect = /*onDeselect*/ ctx[14];
    			layer.$set(layer_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(layer.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(layer.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(layer, detaching);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let positioning;
    	let aesthetics;
    	let { x = undefined } = $$props;
    	let { y = undefined } = $$props;
    	let { geometry = undefined } = $$props;
    	let { rotate = undefined } = $$props;
    	let { anchorPoint = undefined } = $$props;
    	let { text = undefined } = $$props;
    	let { fontSize = undefined } = $$props;
    	let { fontFamily = undefined } = $$props;
    	let { fontWeight = undefined } = $$props;
    	let { fill = undefined } = $$props;
    	let { stroke = undefined } = $$props;
    	let { strokeWidth = undefined } = $$props;
    	let { strokeOpacity = undefined } = $$props;
    	let { fillOpacity = undefined } = $$props;
    	let { opacity = undefined } = $$props;
    	let { outputSettings = undefined } = $$props;
    	let { clip = undefined } = $$props;
    	let { keys = undefined } = $$props;
    	let { blockReindexing = undefined } = $$props;
    	let { onClick = undefined } = $$props;
    	let { onMousedown = undefined } = $$props;
    	let { onMouseup = undefined } = $$props;
    	let { onMouseover = undefined } = $$props;
    	let { onMouseout = undefined } = $$props;
    	let { onMousedrag = undefined } = $$props;
    	let { onTouchdown = undefined } = $$props;
    	let { onTouchup = undefined } = $$props;
    	let { onTouchover = undefined } = $$props;
    	let { onTouchout = undefined } = $$props;
    	let { onTouchdrag = undefined } = $$props;
    	let { onSelect = undefined } = $$props;
    	let { onDeselect = undefined } = $$props;

    	$$self.$$set = $$props => {
    		if ('x' in $$props) $$invalidate(17, x = $$props.x);
    		if ('y' in $$props) $$invalidate(18, y = $$props.y);
    		if ('geometry' in $$props) $$invalidate(19, geometry = $$props.geometry);
    		if ('rotate' in $$props) $$invalidate(20, rotate = $$props.rotate);
    		if ('anchorPoint' in $$props) $$invalidate(21, anchorPoint = $$props.anchorPoint);
    		if ('text' in $$props) $$invalidate(22, text = $$props.text);
    		if ('fontSize' in $$props) $$invalidate(23, fontSize = $$props.fontSize);
    		if ('fontFamily' in $$props) $$invalidate(24, fontFamily = $$props.fontFamily);
    		if ('fontWeight' in $$props) $$invalidate(25, fontWeight = $$props.fontWeight);
    		if ('fill' in $$props) $$invalidate(26, fill = $$props.fill);
    		if ('stroke' in $$props) $$invalidate(27, stroke = $$props.stroke);
    		if ('strokeWidth' in $$props) $$invalidate(28, strokeWidth = $$props.strokeWidth);
    		if ('strokeOpacity' in $$props) $$invalidate(29, strokeOpacity = $$props.strokeOpacity);
    		if ('fillOpacity' in $$props) $$invalidate(30, fillOpacity = $$props.fillOpacity);
    		if ('opacity' in $$props) $$invalidate(31, opacity = $$props.opacity);
    		if ('outputSettings' in $$props) $$invalidate(0, outputSettings = $$props.outputSettings);
    		if ('clip' in $$props) $$invalidate(32, clip = $$props.clip);
    		if ('keys' in $$props) $$invalidate(33, keys = $$props.keys);
    		if ('blockReindexing' in $$props) $$invalidate(1, blockReindexing = $$props.blockReindexing);
    		if ('onClick' in $$props) $$invalidate(2, onClick = $$props.onClick);
    		if ('onMousedown' in $$props) $$invalidate(3, onMousedown = $$props.onMousedown);
    		if ('onMouseup' in $$props) $$invalidate(4, onMouseup = $$props.onMouseup);
    		if ('onMouseover' in $$props) $$invalidate(5, onMouseover = $$props.onMouseover);
    		if ('onMouseout' in $$props) $$invalidate(6, onMouseout = $$props.onMouseout);
    		if ('onMousedrag' in $$props) $$invalidate(7, onMousedrag = $$props.onMousedrag);
    		if ('onTouchdown' in $$props) $$invalidate(8, onTouchdown = $$props.onTouchdown);
    		if ('onTouchup' in $$props) $$invalidate(9, onTouchup = $$props.onTouchup);
    		if ('onTouchover' in $$props) $$invalidate(10, onTouchover = $$props.onTouchover);
    		if ('onTouchout' in $$props) $$invalidate(11, onTouchout = $$props.onTouchout);
    		if ('onTouchdrag' in $$props) $$invalidate(12, onTouchdrag = $$props.onTouchdrag);
    		if ('onSelect' in $$props) $$invalidate(13, onSelect = $$props.onSelect);
    		if ('onDeselect' in $$props) $$invalidate(14, onDeselect = $$props.onDeselect);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*x, y, geometry, rotate, anchorPoint, text, fontSize*/ 16646144) {
    			$$invalidate(16, positioning = {
    				x,
    				y,
    				geometry,
    				rotate,
    				anchorPoint,
    				text,
    				fontSize
    			});
    		}

    		if ($$self.$$.dirty[0] & /*anchorPoint, text, fontSize, fontFamily, fontWeight, fill, stroke, strokeWidth, strokeOpacity, fillOpacity*/ 2145386496 | $$self.$$.dirty[1] & /*opacity, clip, keys*/ 7) {
    			$$invalidate(15, aesthetics = {
    				anchorPoint,
    				text,
    				fontSize,
    				fontFamily,
    				fontWeight,
    				fill,
    				stroke,
    				strokeWidth,
    				strokeOpacity,
    				fillOpacity,
    				opacity,
    				clip,
    				keys
    			});
    		}
    	};

    	return [
    		outputSettings,
    		blockReindexing,
    		onClick,
    		onMousedown,
    		onMouseup,
    		onMouseover,
    		onMouseout,
    		onMousedrag,
    		onTouchdown,
    		onTouchup,
    		onTouchover,
    		onTouchout,
    		onTouchdrag,
    		onSelect,
    		onDeselect,
    		aesthetics,
    		positioning,
    		x,
    		y,
    		geometry,
    		rotate,
    		anchorPoint,
    		text,
    		fontSize,
    		fontFamily,
    		fontWeight,
    		fill,
    		stroke,
    		strokeWidth,
    		strokeOpacity,
    		fillOpacity,
    		opacity,
    		clip,
    		keys
    	];
    }

    class LabelLayer extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$3,
    			create_fragment$3,
    			safe_not_equal,
    			{
    				x: 17,
    				y: 18,
    				geometry: 19,
    				rotate: 20,
    				anchorPoint: 21,
    				text: 22,
    				fontSize: 23,
    				fontFamily: 24,
    				fontWeight: 25,
    				fill: 26,
    				stroke: 27,
    				strokeWidth: 28,
    				strokeOpacity: 29,
    				fillOpacity: 30,
    				opacity: 31,
    				outputSettings: 0,
    				clip: 32,
    				keys: 33,
    				blockReindexing: 1,
    				onClick: 2,
    				onMousedown: 3,
    				onMouseup: 4,
    				onMouseover: 5,
    				onMouseout: 6,
    				onMousedrag: 7,
    				onTouchdown: 8,
    				onTouchup: 9,
    				onTouchover: 10,
    				onTouchout: 11,
    				onTouchdrag: 12,
    				onSelect: 13,
    				onDeselect: 14
    			},
    			null,
    			[-1, -1]
    		);
    	}
    }

    function parseHJust (hjust, xOffset, bbox) {
      const { minX: x1, maxX: x2 } = bbox;

      if (hjust === 'left') {
        return x1 - xOffset
      }

      if (hjust === 'right') {
        return x2 + xOffset
      }

      if (['center', 'centre'].includes(hjust)) {
        return (x2 - x1) / 2 + x1 + xOffset
      }

      if (hjust.constructor === Number) {
        return (x2 - x1) * hjust + x1
      }
    }

    function parseVJust (vjust, yOffset, bbox) {
      const { minY: y1, maxY: y2 } = bbox;

      if (vjust === 'top') {
        return y1 - yOffset
      }

      if (vjust === 'bottom') {
        return y2 + yOffset
      }

      if (['center', 'centre'].includes(vjust)) {
        return (y2 - y1) / 2 + y1 + yOffset
      }

      if (vjust.constructor === Number) {
        return (y2 - y1) * vjust + y1
      }
    }

    function getBaseLineCoordinatesXAxis (yAbs, { paddedBbox }) {
      const { minX, maxX } = paddedBbox;

      return {
        x: ({ pxAt }) => [minX, maxX].map(pxAt),
        y: ({ pyAt }) => [yAbs, yAbs].map(pyAt)
      }
    }

    function getBaseLineCoordinatesYAxis (xAbs, { paddedBbox }) {
      const { minY, maxY } = paddedBbox;

      return {
        x: ({ pxAt }) => [xAbs, xAbs].map(pxAt),
        y: ({ pyAt }) => [minY, maxY].map(pyAt)
      }
    }

    function getTickPositions (tickValuesArray, directScale, tickCount, tickExtra, zoomIdentity) {
      let ticks;

      if (Array.isArray(tickValuesArray) && tickValuesArray.length > 0) {
        ticks = tickValuesArray;
      } else if (isContinuous(directScale)) {
        ticks = getContinuousTicks(directScale, tickCount, zoomIdentity);
      } else if ('domain' in directScale) {
        ticks = directScale.domain();
      } else {
        throw new Error(`Couldn't construct axis. Please provide 'tickValues' or a scale with
      either a 'ticks' or a 'domain' method.`)
      }

      if (tickExtra && 'domain' in directScale && ticks[0] !== directScale.domain()[0]) {
        ticks.unshift(directScale.domain()[0]);
      }

      return ticks
    }

    function isContinuous (scale) {
      return 'ticks' in scale
    }

    function getContinuousTicks (scale, tickCount, zoomIdentity) {
      if (zoomIdentity) {
        const rescaledDomain = rescale(scale, zoomIdentity);
        return scale.copy().domain(rescaledDomain).ticks(tickCount)
      }

      return scale.ticks(tickCount)
    }

    // https://github.com/d3/d3-zoom#transform_rescaleX
    function rescale (scale, { k, t }) {
      const rescaledRange = scale.range().map(r => (r - t) / k);
      const rescaledDomain = rescaledRange.map(scale.invert);

      return rescaledDomain
    }

    function getTickCoordinatesXAxis (
      ticks,
      yAbs,
      tickSize,
      flip
    ) {
      const yOffset = flip ? -tickSize : tickSize;

      return {
        x: ({ scaleX, bwx }) => {
          const bandOffset = bwx ? bwx() / 2 : 0;
          return ticks.map(t => scaleX(t) + bandOffset).map(t => [t, t])
        },
        y: ({ py, pyAt }) => { const y = pyAt(yAbs); return ticks.map(_ => [y, y + py(yOffset)]) }
      }
    }

    function getTickCoordinatesYAxis (
      ticks,
      xAbs,
      tickSize,
      flip
    ) {
      const xOffset = flip ? tickSize : -tickSize;

      return {
        x: ({ px, pxAt }) => { const x = pxAt(xAbs); return ticks.map(_ => [x, x + px(xOffset)]) },
        y: ({ scaleY, bwy }) => {
          const bandOffset = bwy ? bwy() / 2 : 0;
          return ticks.map(t => scaleY(t) + bandOffset).map(t => [t, t])
        }
      }
    }

    function getFormat (labelFormat, scale, numberOfTicks) {
      if (labelFormat) return labelFormat
      if ('tickFormat' in scale) return scale.tickFormat(numberOfTicks)

      return x => x
    }

    function getTickLabelCoordinatesXAxis (
      tickCoordinates,
      labelOffset,
      flip
    ) {
      const dl = flip ? -labelOffset : labelOffset;

      return {
        x: s => tickCoordinates.x(s).map(x => x[0]),
        y: s => tickCoordinates.y(s).map(y => y[1] + s.py(dl))
      }
    }

    function getTickLabelCoordinatesYAxis (
      tickCoordinates,
      labelOffset,
      flip
    ) {
      const dl = flip ? labelOffset : -labelOffset;

      return {
        x: s => tickCoordinates.x(s).map(x => x[1] + s.px(dl)),
        y: s => tickCoordinates.y(s).map(y => y[0])
      }
    }

    // from https://stackoverflow.com/a/21015393
    function getTextWidth (text, fontSize, fontFamily) {
      let canvas;
      if (typeof document === 'undefined') {
        // if we don't have document/canvas available
        // assume ratio width to height is 0.8
        const length = text.length;
        return length * 0.8 * fontSize
      } else {
        // re-use canvas object for better performance
        canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement('canvas'));
        const context = canvas.getContext('2d');
        context.font = fontSize + ' ' + fontFamily;
        const metrics = context.measureText(text);
        return metrics.width
      }
    }

    function getTitleCoordinatesXAxis (
      hjust,
      xOffset,
      vjust,
      yOffset,
      section,
      flip,
      axisHeight,
      fontSize,
      yAbsoluteAxis
    ) {
      const heightOffset = getHeightOffset(yOffset, flip, axisHeight, fontSize);

      const xAbs = parseHJust(hjust, xOffset, section.paddedBbox);
      const yAbs = vjust === 'axis'
        ? yAbsoluteAxis + heightOffset
        : parseVJust(vjust, yOffset, section.paddedBbox) + heightOffset;

      return {
        x: ({ pxAt }) => pxAt(xAbs),
        y: ({ pyAt }) => pyAt(yAbs)
      }
    }

    function getHeightOffset (offset, flip, axisHeight, fontSize) {
      if (offset === 'axis') {
        return flip
          ? -(axisHeight + 1) - fontSize
          : axisHeight + 1
      }

      if (offset.constructor !== Number) {
        throw new Error('yOffset must be a Number or \'axis\'')
      }

      return offset
    }

    function getTitleCoordinatesYAxis (
      hjust,
      xOffset,
      vjust,
      yOffset,
      section,
      flip,
      axisWidth,
      fontSize,
      xAbsoluteAxis
    ) {
      const widthOffset = getWidthOffset(xOffset, flip, axisWidth);

      const xAbs = hjust === 'axis'
        ? xAbsoluteAxis + widthOffset
        : parseHJust(hjust, xOffset, section.paddedBbox);
      const yAbs = parseVJust(vjust, yOffset, section.paddedBbox);

      return {
        x: ({ pxAt }) => pxAt(xAbs),
        y: ({ pyAt }) => pyAt(yAbs)
      }
    }

    function getWidthOffset (offset, flip, axisWidth, fontSize) {
      if (offset === 'axis') {
        return flip
          ? axisWidth + 5
          : -axisWidth - 5
      }

      if (offset.constructor !== Number) {
        throw new Error('xOffset must be a Number or \'axis\'')
      }

      return offset
    }

    /* node_modules/@snlab/florence/src/components/guides/axes/XAxis.svelte generated by Svelte v3.49.0 */

    function create_if_block_2$1(ctx) {
    	let line;
    	let current;

    	const line_spread_levels = [
    		/*baseLineCoordinates*/ ctx[28],
    		{ strokeWidth: /*baseLineWidth*/ ctx[3] },
    		{ opacity: /*baseLineOpacity*/ ctx[2] },
    		{ stroke: /*baseLineColor*/ ctx[1] },
    		{ clip: /*clip*/ ctx[22] }
    	];

    	let line_props = {};

    	for (let i = 0; i < line_spread_levels.length; i += 1) {
    		line_props = assign(line_props, line_spread_levels[i]);
    	}

    	line = new Line({ props: line_props });

    	return {
    		c() {
    			create_component(line.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(line, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const line_changes = (dirty[0] & /*baseLineCoordinates, baseLineWidth, baseLineOpacity, baseLineColor, clip*/ 272629774)
    			? get_spread_update(line_spread_levels, [
    					dirty[0] & /*baseLineCoordinates*/ 268435456 && get_spread_object(/*baseLineCoordinates*/ ctx[28]),
    					dirty[0] & /*baseLineWidth*/ 8 && { strokeWidth: /*baseLineWidth*/ ctx[3] },
    					dirty[0] & /*baseLineOpacity*/ 4 && { opacity: /*baseLineOpacity*/ ctx[2] },
    					dirty[0] & /*baseLineColor*/ 2 && { stroke: /*baseLineColor*/ ctx[1] },
    					dirty[0] & /*clip*/ 4194304 && { clip: /*clip*/ ctx[22] }
    				])
    			: {};

    			line.$set(line_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(line.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(line.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(line, detaching);
    		}
    	};
    }

    // (125:0) {#if ticks}
    function create_if_block_1$1(ctx) {
    	let linelayer;
    	let t;
    	let labellayer;
    	let current;

    	const linelayer_spread_levels = [
    		/*tickCoordinates*/ ctx[23],
    		{ strokeWidth: /*tickWidth*/ ctx[5] },
    		{ opacity: /*tickOpacity*/ ctx[7] },
    		{ stroke: /*tickColor*/ ctx[6] },
    		{ clip: /*clip*/ ctx[22] }
    	];

    	let linelayer_props = {};

    	for (let i = 0; i < linelayer_spread_levels.length; i += 1) {
    		linelayer_props = assign(linelayer_props, linelayer_spread_levels[i]);
    	}

    	linelayer = new LineLayer({ props: linelayer_props });

    	const labellayer_spread_levels = [
    		/*tickLabelCoordinates*/ ctx[26],
    		{ text: /*tickLabelText*/ ctx[27] },
    		{
    			anchorPoint: /*labelAnchorPoint*/ ctx[25]
    		},
    		{ rotate: /*labelRotate*/ ctx[8] },
    		{ fontFamily: /*labelFont*/ ctx[9] },
    		{ fontSize: /*labelFontSize*/ ctx[10] },
    		{ fontWeight: /*labelFontWeight*/ ctx[11] },
    		{ opacity: /*labelOpacity*/ ctx[12] },
    		{ fill: /*labelColor*/ ctx[13] },
    		{ clip: /*clip*/ ctx[22] }
    	];

    	let labellayer_props = {};

    	for (let i = 0; i < labellayer_spread_levels.length; i += 1) {
    		labellayer_props = assign(labellayer_props, labellayer_spread_levels[i]);
    	}

    	labellayer = new LabelLayer({ props: labellayer_props });

    	return {
    		c() {
    			create_component(linelayer.$$.fragment);
    			t = space();
    			create_component(labellayer.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(linelayer, target, anchor);
    			insert(target, t, anchor);
    			mount_component(labellayer, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const linelayer_changes = (dirty[0] & /*tickCoordinates, tickWidth, tickOpacity, tickColor, clip*/ 12583136)
    			? get_spread_update(linelayer_spread_levels, [
    					dirty[0] & /*tickCoordinates*/ 8388608 && get_spread_object(/*tickCoordinates*/ ctx[23]),
    					dirty[0] & /*tickWidth*/ 32 && { strokeWidth: /*tickWidth*/ ctx[5] },
    					dirty[0] & /*tickOpacity*/ 128 && { opacity: /*tickOpacity*/ ctx[7] },
    					dirty[0] & /*tickColor*/ 64 && { stroke: /*tickColor*/ ctx[6] },
    					dirty[0] & /*clip*/ 4194304 && { clip: /*clip*/ ctx[22] }
    				])
    			: {};

    			linelayer.$set(linelayer_changes);

    			const labellayer_changes = (dirty[0] & /*tickLabelCoordinates, tickLabelText, labelAnchorPoint, labelRotate, labelFont, labelFontSize, labelFontWeight, labelOpacity, labelColor, clip*/ 239091456)
    			? get_spread_update(labellayer_spread_levels, [
    					dirty[0] & /*tickLabelCoordinates*/ 67108864 && get_spread_object(/*tickLabelCoordinates*/ ctx[26]),
    					dirty[0] & /*tickLabelText*/ 134217728 && { text: /*tickLabelText*/ ctx[27] },
    					dirty[0] & /*labelAnchorPoint*/ 33554432 && {
    						anchorPoint: /*labelAnchorPoint*/ ctx[25]
    					},
    					dirty[0] & /*labelRotate*/ 256 && { rotate: /*labelRotate*/ ctx[8] },
    					dirty[0] & /*labelFont*/ 512 && { fontFamily: /*labelFont*/ ctx[9] },
    					dirty[0] & /*labelFontSize*/ 1024 && { fontSize: /*labelFontSize*/ ctx[10] },
    					dirty[0] & /*labelFontWeight*/ 2048 && { fontWeight: /*labelFontWeight*/ ctx[11] },
    					dirty[0] & /*labelOpacity*/ 4096 && { opacity: /*labelOpacity*/ ctx[12] },
    					dirty[0] & /*labelColor*/ 8192 && { fill: /*labelColor*/ ctx[13] },
    					dirty[0] & /*clip*/ 4194304 && { clip: /*clip*/ ctx[22] }
    				])
    			: {};

    			labellayer.$set(labellayer_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(linelayer.$$.fragment, local);
    			transition_in(labellayer.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(linelayer.$$.fragment, local);
    			transition_out(labellayer.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(linelayer, detaching);
    			if (detaching) detach(t);
    			destroy_component(labellayer, detaching);
    		}
    	};
    }

    // (148:0) {#if title.length > 0}
    function create_if_block$2(ctx) {
    	let label;
    	let current;

    	const label_spread_levels = [
    		/*titleCoordinates*/ ctx[24],
    		{ text: /*title*/ ctx[14] },
    		{
    			anchorPoint: /*titleAnchorPoint*/ ctx[21]
    		},
    		{ rotate: /*titleRotate*/ ctx[20] },
    		{ fontFamily: /*titleFont*/ ctx[16] },
    		{ fontSize: /*titleFontSize*/ ctx[17] },
    		{ fontWeight: /*titleFontWeight*/ ctx[18] },
    		{ opacity: /*titleOpacity*/ ctx[19] },
    		{ fill: /*titleColor*/ ctx[15] },
    		{ clip: /*clip*/ ctx[22] }
    	];

    	let label_props = {};

    	for (let i = 0; i < label_spread_levels.length; i += 1) {
    		label_props = assign(label_props, label_spread_levels[i]);
    	}

    	label = new Label({ props: label_props });

    	return {
    		c() {
    			create_component(label.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(label, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const label_changes = (dirty[0] & /*titleCoordinates, title, titleAnchorPoint, titleRotate, titleFont, titleFontSize, titleFontWeight, titleOpacity, titleColor, clip*/ 25149440)
    			? get_spread_update(label_spread_levels, [
    					dirty[0] & /*titleCoordinates*/ 16777216 && get_spread_object(/*titleCoordinates*/ ctx[24]),
    					dirty[0] & /*title*/ 16384 && { text: /*title*/ ctx[14] },
    					dirty[0] & /*titleAnchorPoint*/ 2097152 && {
    						anchorPoint: /*titleAnchorPoint*/ ctx[21]
    					},
    					dirty[0] & /*titleRotate*/ 1048576 && { rotate: /*titleRotate*/ ctx[20] },
    					dirty[0] & /*titleFont*/ 65536 && { fontFamily: /*titleFont*/ ctx[16] },
    					dirty[0] & /*titleFontSize*/ 131072 && { fontSize: /*titleFontSize*/ ctx[17] },
    					dirty[0] & /*titleFontWeight*/ 262144 && { fontWeight: /*titleFontWeight*/ ctx[18] },
    					dirty[0] & /*titleOpacity*/ 524288 && { opacity: /*titleOpacity*/ ctx[19] },
    					dirty[0] & /*titleColor*/ 32768 && { fill: /*titleColor*/ ctx[15] },
    					dirty[0] & /*clip*/ 4194304 && { clip: /*clip*/ ctx[22] }
    				])
    			: {};

    			label.$set(label_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(label, detaching);
    		}
    	};
    }

    function create_fragment$2(ctx) {
    	let t0;
    	let t1;
    	let if_block2_anchor;
    	let current;
    	let if_block0 = /*baseLine*/ ctx[0] && create_if_block_2$1(ctx);
    	let if_block1 = /*ticks*/ ctx[4] && create_if_block_1$1(ctx);
    	let if_block2 = /*title*/ ctx[14].length > 0 && create_if_block$2(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			if_block2_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t0, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, t1, anchor);
    			if (if_block2) if_block2.m(target, anchor);
    			insert(target, if_block2_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*baseLine*/ ctx[0]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*baseLine*/ 1) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_2$1(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*ticks*/ ctx[4]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*ticks*/ 16) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_1$1(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(t1.parentNode, t1);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (/*title*/ ctx[14].length > 0) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[0] & /*title*/ 16384) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block$2(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(if_block2_anchor.parentNode, if_block2_anchor);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t0);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(t1);
    			if (if_block2) if_block2.d(detaching);
    			if (detaching) detach(if_block2_anchor);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let yAbs;
    	let baseLineCoordinates;
    	let tickPositions;
    	let tickCoordinates;
    	let format;
    	let tickLabelText;
    	let tickLabelCoordinates;
    	let labelAnchorPoint;
    	let axisHeight;
    	let titleCoordinates;
    	let $section;
    	let { flip = false } = $$props;
    	let { baseLine = true } = $$props;
    	let { baseLineColor = 'black' } = $$props;
    	let { baseLineOpacity = 1 } = $$props;
    	let { baseLineWidth = 1 } = $$props;
    	let { vjust = 'bottom' } = $$props;
    	let { yOffset = 0 } = $$props;
    	let { ticks = true } = $$props;
    	let { tickCount = 10 } = $$props;
    	let { tickExtra = false } = $$props;
    	let { tickValues = undefined } = $$props;
    	let { tickSize = 5 } = $$props;
    	let { tickWidth = 0.5 } = $$props;
    	let { tickColor = 'black' } = $$props;
    	let { tickOpacity = 1 } = $$props;
    	let { labelFormat = undefined } = $$props;
    	let { labelOffset = 6 } = $$props;
    	let { labelRotate = 0 } = $$props;
    	let { labelFont = 'Helvetica' } = $$props;
    	let { labelFontSize = 10 } = $$props;
    	let { labelFontWeight = 'normal' } = $$props;
    	let { labelOpacity = 1 } = $$props;
    	let { labelColor = 'black' } = $$props;
    	let { titleHjust = 'center' } = $$props;
    	let { titleXOffset = 0 } = $$props;
    	let { titleVjust = 'axis' } = $$props;
    	let { titleYOffset = 'axis' } = $$props;
    	let { title = '' } = $$props;
    	let { titleColor = 'black' } = $$props;
    	let { titleFont = 'Helvetica' } = $$props;
    	let { titleFontSize = 12 } = $$props;
    	let { titleFontWeight = 'normal' } = $$props;
    	let { titleOpacity = 1 } = $$props;
    	let { titleRotate = 0 } = $$props;
    	let { titleAnchorPoint = 't' } = $$props;
    	let { clip = 'outer' } = $$props;

    	// Contexts
    	const section = getContext('section');

    	component_subscribe($$self, section, value => $$invalidate(47, $section = value));

    	$$self.$$set = $$props => {
    		if ('flip' in $$props) $$invalidate(30, flip = $$props.flip);
    		if ('baseLine' in $$props) $$invalidate(0, baseLine = $$props.baseLine);
    		if ('baseLineColor' in $$props) $$invalidate(1, baseLineColor = $$props.baseLineColor);
    		if ('baseLineOpacity' in $$props) $$invalidate(2, baseLineOpacity = $$props.baseLineOpacity);
    		if ('baseLineWidth' in $$props) $$invalidate(3, baseLineWidth = $$props.baseLineWidth);
    		if ('vjust' in $$props) $$invalidate(31, vjust = $$props.vjust);
    		if ('yOffset' in $$props) $$invalidate(32, yOffset = $$props.yOffset);
    		if ('ticks' in $$props) $$invalidate(4, ticks = $$props.ticks);
    		if ('tickCount' in $$props) $$invalidate(33, tickCount = $$props.tickCount);
    		if ('tickExtra' in $$props) $$invalidate(34, tickExtra = $$props.tickExtra);
    		if ('tickValues' in $$props) $$invalidate(35, tickValues = $$props.tickValues);
    		if ('tickSize' in $$props) $$invalidate(36, tickSize = $$props.tickSize);
    		if ('tickWidth' in $$props) $$invalidate(5, tickWidth = $$props.tickWidth);
    		if ('tickColor' in $$props) $$invalidate(6, tickColor = $$props.tickColor);
    		if ('tickOpacity' in $$props) $$invalidate(7, tickOpacity = $$props.tickOpacity);
    		if ('labelFormat' in $$props) $$invalidate(37, labelFormat = $$props.labelFormat);
    		if ('labelOffset' in $$props) $$invalidate(38, labelOffset = $$props.labelOffset);
    		if ('labelRotate' in $$props) $$invalidate(8, labelRotate = $$props.labelRotate);
    		if ('labelFont' in $$props) $$invalidate(9, labelFont = $$props.labelFont);
    		if ('labelFontSize' in $$props) $$invalidate(10, labelFontSize = $$props.labelFontSize);
    		if ('labelFontWeight' in $$props) $$invalidate(11, labelFontWeight = $$props.labelFontWeight);
    		if ('labelOpacity' in $$props) $$invalidate(12, labelOpacity = $$props.labelOpacity);
    		if ('labelColor' in $$props) $$invalidate(13, labelColor = $$props.labelColor);
    		if ('titleHjust' in $$props) $$invalidate(39, titleHjust = $$props.titleHjust);
    		if ('titleXOffset' in $$props) $$invalidate(40, titleXOffset = $$props.titleXOffset);
    		if ('titleVjust' in $$props) $$invalidate(41, titleVjust = $$props.titleVjust);
    		if ('titleYOffset' in $$props) $$invalidate(42, titleYOffset = $$props.titleYOffset);
    		if ('title' in $$props) $$invalidate(14, title = $$props.title);
    		if ('titleColor' in $$props) $$invalidate(15, titleColor = $$props.titleColor);
    		if ('titleFont' in $$props) $$invalidate(16, titleFont = $$props.titleFont);
    		if ('titleFontSize' in $$props) $$invalidate(17, titleFontSize = $$props.titleFontSize);
    		if ('titleFontWeight' in $$props) $$invalidate(18, titleFontWeight = $$props.titleFontWeight);
    		if ('titleOpacity' in $$props) $$invalidate(19, titleOpacity = $$props.titleOpacity);
    		if ('titleRotate' in $$props) $$invalidate(20, titleRotate = $$props.titleRotate);
    		if ('titleAnchorPoint' in $$props) $$invalidate(21, titleAnchorPoint = $$props.titleAnchorPoint);
    		if ('clip' in $$props) $$invalidate(22, clip = $$props.clip);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[1] & /*$section*/ 65536) {
    			{
    				if ($section.coordinateSystem) {
    					throw new Error('Cannot use axes with alternative coordinate systems (for now)');
    				}
    			}
    		}

    		if ($$self.$$.dirty[1] & /*vjust, yOffset, $section*/ 65539) {
    			// Absolute position (in pixels)
    			$$invalidate(43, yAbs = parseVJust(vjust, yOffset, $section.paddedBbox));
    		}

    		if ($$self.$$.dirty[1] & /*yAbs, $section*/ 69632) {
    			// Baseline
    			$$invalidate(28, baseLineCoordinates = getBaseLineCoordinatesXAxis(yAbs, $section));
    		}

    		if ($$self.$$.dirty[1] & /*tickValues, $section, tickCount, tickExtra*/ 65564) {
    			// Ticks
    			$$invalidate(46, tickPositions = getTickPositions(tickValues, $section.directScales.x, tickCount, tickExtra, $section.zoomIdentity
    			? {
    					t: $section.zoomIdentity.x,
    					k: $section.zoomIdentity.kx
    				}
    			: undefined));
    		}

    		if ($$self.$$.dirty[0] & /*flip*/ 1073741824 | $$self.$$.dirty[1] & /*tickPositions, yAbs, tickSize*/ 36896) {
    			$$invalidate(23, tickCoordinates = getTickCoordinatesXAxis(tickPositions, yAbs, tickSize, flip));
    		}

    		if ($$self.$$.dirty[0] & /*ticks*/ 16 | $$self.$$.dirty[1] & /*labelFormat, $section*/ 65600) {
    			// Tick labels
    			$$invalidate(45, format = getFormat(labelFormat, $section.scaleX, ticks.length));
    		}

    		if ($$self.$$.dirty[1] & /*tickPositions, format*/ 49152) {
    			$$invalidate(27, tickLabelText = tickPositions.map(format));
    		}

    		if ($$self.$$.dirty[0] & /*tickCoordinates, flip*/ 1082130432 | $$self.$$.dirty[1] & /*labelOffset*/ 128) {
    			$$invalidate(26, tickLabelCoordinates = getTickLabelCoordinatesXAxis(tickCoordinates, labelOffset, flip));
    		}

    		if ($$self.$$.dirty[0] & /*flip*/ 1073741824) {
    			$$invalidate(25, labelAnchorPoint = flip ? 'b' : 't');
    		}

    		if ($$self.$$.dirty[0] & /*baseLineWidth, labelFontSize*/ 1032 | $$self.$$.dirty[1] & /*tickSize, labelOffset*/ 160) {
    			// Title
    			$$invalidate(44, axisHeight = baseLineWidth + tickSize + labelOffset + labelFontSize);
    		}

    		if ($$self.$$.dirty[0] & /*flip, titleFontSize*/ 1073872896 | $$self.$$.dirty[1] & /*titleHjust, titleXOffset, titleVjust, titleYOffset, $section, axisHeight, yAbs*/ 81664) {
    			$$invalidate(24, titleCoordinates = getTitleCoordinatesXAxis(titleHjust, titleXOffset, titleVjust, titleYOffset, $section, flip, axisHeight, titleFontSize, yAbs));
    		}
    	};

    	return [
    		baseLine,
    		baseLineColor,
    		baseLineOpacity,
    		baseLineWidth,
    		ticks,
    		tickWidth,
    		tickColor,
    		tickOpacity,
    		labelRotate,
    		labelFont,
    		labelFontSize,
    		labelFontWeight,
    		labelOpacity,
    		labelColor,
    		title,
    		titleColor,
    		titleFont,
    		titleFontSize,
    		titleFontWeight,
    		titleOpacity,
    		titleRotate,
    		titleAnchorPoint,
    		clip,
    		tickCoordinates,
    		titleCoordinates,
    		labelAnchorPoint,
    		tickLabelCoordinates,
    		tickLabelText,
    		baseLineCoordinates,
    		section,
    		flip,
    		vjust,
    		yOffset,
    		tickCount,
    		tickExtra,
    		tickValues,
    		tickSize,
    		labelFormat,
    		labelOffset,
    		titleHjust,
    		titleXOffset,
    		titleVjust,
    		titleYOffset,
    		yAbs,
    		axisHeight,
    		format,
    		tickPositions,
    		$section
    	];
    }

    class XAxis extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$2,
    			create_fragment$2,
    			safe_not_equal,
    			{
    				flip: 30,
    				baseLine: 0,
    				baseLineColor: 1,
    				baseLineOpacity: 2,
    				baseLineWidth: 3,
    				vjust: 31,
    				yOffset: 32,
    				ticks: 4,
    				tickCount: 33,
    				tickExtra: 34,
    				tickValues: 35,
    				tickSize: 36,
    				tickWidth: 5,
    				tickColor: 6,
    				tickOpacity: 7,
    				labelFormat: 37,
    				labelOffset: 38,
    				labelRotate: 8,
    				labelFont: 9,
    				labelFontSize: 10,
    				labelFontWeight: 11,
    				labelOpacity: 12,
    				labelColor: 13,
    				titleHjust: 39,
    				titleXOffset: 40,
    				titleVjust: 41,
    				titleYOffset: 42,
    				title: 14,
    				titleColor: 15,
    				titleFont: 16,
    				titleFontSize: 17,
    				titleFontWeight: 18,
    				titleOpacity: 19,
    				titleRotate: 20,
    				titleAnchorPoint: 21,
    				clip: 22
    			},
    			null,
    			[-1, -1]
    		);
    	}
    }

    /* node_modules/@snlab/florence/src/components/guides/axes/YAxis.svelte generated by Svelte v3.49.0 */

    function create_if_block_2(ctx) {
    	let line;
    	let current;

    	const line_spread_levels = [
    		/*baseLineCoordinates*/ ctx[28],
    		{ strokeWidth: /*baseLineWidth*/ ctx[3] },
    		{ opacity: /*baseLineOpacity*/ ctx[2] },
    		{ stroke: /*baseLineColor*/ ctx[1] },
    		{ clip: /*clip*/ ctx[22] }
    	];

    	let line_props = {};

    	for (let i = 0; i < line_spread_levels.length; i += 1) {
    		line_props = assign(line_props, line_spread_levels[i]);
    	}

    	line = new Line({ props: line_props });

    	return {
    		c() {
    			create_component(line.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(line, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const line_changes = (dirty[0] & /*baseLineCoordinates, baseLineWidth, baseLineOpacity, baseLineColor, clip*/ 272629774)
    			? get_spread_update(line_spread_levels, [
    					dirty[0] & /*baseLineCoordinates*/ 268435456 && get_spread_object(/*baseLineCoordinates*/ ctx[28]),
    					dirty[0] & /*baseLineWidth*/ 8 && { strokeWidth: /*baseLineWidth*/ ctx[3] },
    					dirty[0] & /*baseLineOpacity*/ 4 && { opacity: /*baseLineOpacity*/ ctx[2] },
    					dirty[0] & /*baseLineColor*/ 2 && { stroke: /*baseLineColor*/ ctx[1] },
    					dirty[0] & /*clip*/ 4194304 && { clip: /*clip*/ ctx[22] }
    				])
    			: {};

    			line.$set(line_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(line.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(line.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(line, detaching);
    		}
    	};
    }

    // (127:0) {#if ticks}
    function create_if_block_1(ctx) {
    	let linelayer;
    	let t;
    	let labellayer;
    	let current;

    	const linelayer_spread_levels = [
    		/*tickCoordinates*/ ctx[24],
    		{ strokeWidth: /*tickWidth*/ ctx[5] },
    		{ opacity: /*tickOpacity*/ ctx[7] },
    		{ stroke: /*tickColor*/ ctx[6] },
    		{ clip: /*clip*/ ctx[22] }
    	];

    	let linelayer_props = {};

    	for (let i = 0; i < linelayer_spread_levels.length; i += 1) {
    		linelayer_props = assign(linelayer_props, linelayer_spread_levels[i]);
    	}

    	linelayer = new LineLayer({ props: linelayer_props });

    	const labellayer_spread_levels = [
    		/*tickLabelCoordinates*/ ctx[27],
    		{ text: /*tickLabelText*/ ctx[23] },
    		{
    			anchorPoint: /*labelAnchorPoint*/ ctx[26]
    		},
    		{ rotate: /*labelRotate*/ ctx[8] },
    		{ fontFamily: /*labelFont*/ ctx[9] },
    		{ fontSize: /*labelFontSize*/ ctx[10] },
    		{ fontWeight: /*labelFontWeight*/ ctx[11] },
    		{ opacity: /*labelOpacity*/ ctx[12] },
    		{ fill: /*labelColor*/ ctx[13] },
    		{ clip: /*clip*/ ctx[22] }
    	];

    	let labellayer_props = {};

    	for (let i = 0; i < labellayer_spread_levels.length; i += 1) {
    		labellayer_props = assign(labellayer_props, labellayer_spread_levels[i]);
    	}

    	labellayer = new LabelLayer({ props: labellayer_props });

    	return {
    		c() {
    			create_component(linelayer.$$.fragment);
    			t = space();
    			create_component(labellayer.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(linelayer, target, anchor);
    			insert(target, t, anchor);
    			mount_component(labellayer, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const linelayer_changes = (dirty[0] & /*tickCoordinates, tickWidth, tickOpacity, tickColor, clip*/ 20971744)
    			? get_spread_update(linelayer_spread_levels, [
    					dirty[0] & /*tickCoordinates*/ 16777216 && get_spread_object(/*tickCoordinates*/ ctx[24]),
    					dirty[0] & /*tickWidth*/ 32 && { strokeWidth: /*tickWidth*/ ctx[5] },
    					dirty[0] & /*tickOpacity*/ 128 && { opacity: /*tickOpacity*/ ctx[7] },
    					dirty[0] & /*tickColor*/ 64 && { stroke: /*tickColor*/ ctx[6] },
    					dirty[0] & /*clip*/ 4194304 && { clip: /*clip*/ ctx[22] }
    				])
    			: {};

    			linelayer.$set(linelayer_changes);

    			const labellayer_changes = (dirty[0] & /*tickLabelCoordinates, tickLabelText, labelAnchorPoint, labelRotate, labelFont, labelFontSize, labelFontWeight, labelOpacity, labelColor, clip*/ 213925632)
    			? get_spread_update(labellayer_spread_levels, [
    					dirty[0] & /*tickLabelCoordinates*/ 134217728 && get_spread_object(/*tickLabelCoordinates*/ ctx[27]),
    					dirty[0] & /*tickLabelText*/ 8388608 && { text: /*tickLabelText*/ ctx[23] },
    					dirty[0] & /*labelAnchorPoint*/ 67108864 && {
    						anchorPoint: /*labelAnchorPoint*/ ctx[26]
    					},
    					dirty[0] & /*labelRotate*/ 256 && { rotate: /*labelRotate*/ ctx[8] },
    					dirty[0] & /*labelFont*/ 512 && { fontFamily: /*labelFont*/ ctx[9] },
    					dirty[0] & /*labelFontSize*/ 1024 && { fontSize: /*labelFontSize*/ ctx[10] },
    					dirty[0] & /*labelFontWeight*/ 2048 && { fontWeight: /*labelFontWeight*/ ctx[11] },
    					dirty[0] & /*labelOpacity*/ 4096 && { opacity: /*labelOpacity*/ ctx[12] },
    					dirty[0] & /*labelColor*/ 8192 && { fill: /*labelColor*/ ctx[13] },
    					dirty[0] & /*clip*/ 4194304 && { clip: /*clip*/ ctx[22] }
    				])
    			: {};

    			labellayer.$set(labellayer_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(linelayer.$$.fragment, local);
    			transition_in(labellayer.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(linelayer.$$.fragment, local);
    			transition_out(labellayer.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(linelayer, detaching);
    			if (detaching) detach(t);
    			destroy_component(labellayer, detaching);
    		}
    	};
    }

    // (150:0) {#if title.length > 0}
    function create_if_block$1(ctx) {
    	let label;
    	let current;

    	const label_spread_levels = [
    		/*titleCoordinates*/ ctx[25],
    		{ text: /*title*/ ctx[14] },
    		{
    			anchorPoint: /*titleAnchorPoint*/ ctx[21]
    		},
    		{ rotate: /*titleRotate*/ ctx[20] },
    		{ fontFamily: /*titleFont*/ ctx[16] },
    		{ fontSize: /*titleFontSize*/ ctx[17] },
    		{ fontWeight: /*titleFontWeight*/ ctx[18] },
    		{ opacity: /*titleOpacity*/ ctx[19] },
    		{ fill: /*titleColor*/ ctx[15] },
    		{ clip: /*clip*/ ctx[22] }
    	];

    	let label_props = {};

    	for (let i = 0; i < label_spread_levels.length; i += 1) {
    		label_props = assign(label_props, label_spread_levels[i]);
    	}

    	label = new Label({ props: label_props });

    	return {
    		c() {
    			create_component(label.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(label, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const label_changes = (dirty[0] & /*titleCoordinates, title, titleAnchorPoint, titleRotate, titleFont, titleFontSize, titleFontWeight, titleOpacity, titleColor, clip*/ 41926656)
    			? get_spread_update(label_spread_levels, [
    					dirty[0] & /*titleCoordinates*/ 33554432 && get_spread_object(/*titleCoordinates*/ ctx[25]),
    					dirty[0] & /*title*/ 16384 && { text: /*title*/ ctx[14] },
    					dirty[0] & /*titleAnchorPoint*/ 2097152 && {
    						anchorPoint: /*titleAnchorPoint*/ ctx[21]
    					},
    					dirty[0] & /*titleRotate*/ 1048576 && { rotate: /*titleRotate*/ ctx[20] },
    					dirty[0] & /*titleFont*/ 65536 && { fontFamily: /*titleFont*/ ctx[16] },
    					dirty[0] & /*titleFontSize*/ 131072 && { fontSize: /*titleFontSize*/ ctx[17] },
    					dirty[0] & /*titleFontWeight*/ 262144 && { fontWeight: /*titleFontWeight*/ ctx[18] },
    					dirty[0] & /*titleOpacity*/ 524288 && { opacity: /*titleOpacity*/ ctx[19] },
    					dirty[0] & /*titleColor*/ 32768 && { fill: /*titleColor*/ ctx[15] },
    					dirty[0] & /*clip*/ 4194304 && { clip: /*clip*/ ctx[22] }
    				])
    			: {};

    			label.$set(label_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(label, detaching);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let t0;
    	let t1;
    	let if_block2_anchor;
    	let current;
    	let if_block0 = /*baseLine*/ ctx[0] && create_if_block_2(ctx);
    	let if_block1 = /*ticks*/ ctx[4] && create_if_block_1(ctx);
    	let if_block2 = /*title*/ ctx[14].length > 0 && create_if_block$1(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			if_block2_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t0, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, t1, anchor);
    			if (if_block2) if_block2.m(target, anchor);
    			insert(target, if_block2_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*baseLine*/ ctx[0]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*baseLine*/ 1) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_2(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*ticks*/ ctx[4]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*ticks*/ 16) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_1(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(t1.parentNode, t1);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (/*title*/ ctx[14].length > 0) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[0] & /*title*/ 16384) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block$1(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(if_block2_anchor.parentNode, if_block2_anchor);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t0);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(t1);
    			if (if_block2) if_block2.d(detaching);
    			if (detaching) detach(if_block2_anchor);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let xAbs;
    	let baseLineCoordinates;
    	let tickPositions;
    	let tickCoordinates;
    	let format;
    	let tickLabelText;
    	let tickLabelCoordinates;
    	let labelAnchorPoint;
    	let tickLabelWidth;
    	let axisWidth;
    	let titleCoordinates;
    	let $section;
    	let { flip = false } = $$props;
    	let { baseLine = true } = $$props;
    	let { baseLineColor = 'black' } = $$props;
    	let { baseLineOpacity = 1 } = $$props;
    	let { baseLineWidth = 1 } = $$props;
    	let { hjust = 'left' } = $$props;
    	let { xOffset = 0 } = $$props;
    	let { ticks = true } = $$props;
    	let { tickCount = 10 } = $$props;
    	let { tickExtra = false } = $$props;
    	let { tickValues = undefined } = $$props;
    	let { tickSize = 5 } = $$props;
    	let { tickWidth = 0.5 } = $$props;
    	let { tickColor = 'black' } = $$props;
    	let { tickOpacity = 1 } = $$props;
    	let { labelFormat = undefined } = $$props;
    	let { labelOffset = 4 } = $$props;
    	let { labelRotate = 0 } = $$props;
    	let { labelFont = 'Helvetica' } = $$props;
    	let { labelFontSize = 10 } = $$props;
    	let { labelFontWeight = 'normal' } = $$props;
    	let { labelOpacity = 1 } = $$props;
    	let { labelColor = 'black' } = $$props;
    	let { titleHjust = 'axis' } = $$props;
    	let { titleXOffset = 'axis' } = $$props;
    	let { titleVjust = 'center' } = $$props;
    	let { titleYOffset = 0 } = $$props;
    	let { title = '' } = $$props;
    	let { titleColor = 'black' } = $$props;
    	let { titleFont = 'Helvetica' } = $$props;
    	let { titleFontSize = 12 } = $$props;
    	let { titleFontWeight = 'normal' } = $$props;
    	let { titleOpacity = 1 } = $$props;
    	let { titleRotate = -Math.PI / 2 } = $$props;
    	let { titleAnchorPoint = 'center' } = $$props;
    	let { clip = 'outer' } = $$props;

    	// Contexts
    	const section = getContext('section');

    	component_subscribe($$self, section, value => $$invalidate(48, $section = value));

    	$$self.$$set = $$props => {
    		if ('flip' in $$props) $$invalidate(30, flip = $$props.flip);
    		if ('baseLine' in $$props) $$invalidate(0, baseLine = $$props.baseLine);
    		if ('baseLineColor' in $$props) $$invalidate(1, baseLineColor = $$props.baseLineColor);
    		if ('baseLineOpacity' in $$props) $$invalidate(2, baseLineOpacity = $$props.baseLineOpacity);
    		if ('baseLineWidth' in $$props) $$invalidate(3, baseLineWidth = $$props.baseLineWidth);
    		if ('hjust' in $$props) $$invalidate(31, hjust = $$props.hjust);
    		if ('xOffset' in $$props) $$invalidate(32, xOffset = $$props.xOffset);
    		if ('ticks' in $$props) $$invalidate(4, ticks = $$props.ticks);
    		if ('tickCount' in $$props) $$invalidate(33, tickCount = $$props.tickCount);
    		if ('tickExtra' in $$props) $$invalidate(34, tickExtra = $$props.tickExtra);
    		if ('tickValues' in $$props) $$invalidate(35, tickValues = $$props.tickValues);
    		if ('tickSize' in $$props) $$invalidate(36, tickSize = $$props.tickSize);
    		if ('tickWidth' in $$props) $$invalidate(5, tickWidth = $$props.tickWidth);
    		if ('tickColor' in $$props) $$invalidate(6, tickColor = $$props.tickColor);
    		if ('tickOpacity' in $$props) $$invalidate(7, tickOpacity = $$props.tickOpacity);
    		if ('labelFormat' in $$props) $$invalidate(37, labelFormat = $$props.labelFormat);
    		if ('labelOffset' in $$props) $$invalidate(38, labelOffset = $$props.labelOffset);
    		if ('labelRotate' in $$props) $$invalidate(8, labelRotate = $$props.labelRotate);
    		if ('labelFont' in $$props) $$invalidate(9, labelFont = $$props.labelFont);
    		if ('labelFontSize' in $$props) $$invalidate(10, labelFontSize = $$props.labelFontSize);
    		if ('labelFontWeight' in $$props) $$invalidate(11, labelFontWeight = $$props.labelFontWeight);
    		if ('labelOpacity' in $$props) $$invalidate(12, labelOpacity = $$props.labelOpacity);
    		if ('labelColor' in $$props) $$invalidate(13, labelColor = $$props.labelColor);
    		if ('titleHjust' in $$props) $$invalidate(39, titleHjust = $$props.titleHjust);
    		if ('titleXOffset' in $$props) $$invalidate(40, titleXOffset = $$props.titleXOffset);
    		if ('titleVjust' in $$props) $$invalidate(41, titleVjust = $$props.titleVjust);
    		if ('titleYOffset' in $$props) $$invalidate(42, titleYOffset = $$props.titleYOffset);
    		if ('title' in $$props) $$invalidate(14, title = $$props.title);
    		if ('titleColor' in $$props) $$invalidate(15, titleColor = $$props.titleColor);
    		if ('titleFont' in $$props) $$invalidate(16, titleFont = $$props.titleFont);
    		if ('titleFontSize' in $$props) $$invalidate(17, titleFontSize = $$props.titleFontSize);
    		if ('titleFontWeight' in $$props) $$invalidate(18, titleFontWeight = $$props.titleFontWeight);
    		if ('titleOpacity' in $$props) $$invalidate(19, titleOpacity = $$props.titleOpacity);
    		if ('titleRotate' in $$props) $$invalidate(20, titleRotate = $$props.titleRotate);
    		if ('titleAnchorPoint' in $$props) $$invalidate(21, titleAnchorPoint = $$props.titleAnchorPoint);
    		if ('clip' in $$props) $$invalidate(22, clip = $$props.clip);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[1] & /*$section*/ 131072) {
    			// Make sure not polar
    			{
    				if ($section.transformation === 'polar') {
    					throw new Error('Axes do\'nt work with polar coordinates (for now)');
    				}
    			}
    		}

    		if ($$self.$$.dirty[1] & /*hjust, xOffset, $section*/ 131075) {
    			// Absolute position (in pixels)
    			$$invalidate(43, xAbs = parseHJust(hjust, xOffset, $section.paddedBbox));
    		}

    		if ($$self.$$.dirty[1] & /*xAbs, $section*/ 135168) {
    			// Baseline
    			$$invalidate(28, baseLineCoordinates = getBaseLineCoordinatesYAxis(xAbs, $section));
    		}

    		if ($$self.$$.dirty[1] & /*tickValues, $section, tickCount, tickExtra*/ 131100) {
    			// Ticks
    			$$invalidate(47, tickPositions = getTickPositions(tickValues, $section.directScales.y, tickCount, tickExtra, $section.zoomIdentity
    			? {
    					t: $section.zoomIdentity.y,
    					k: $section.zoomIdentity.ky
    				}
    			: undefined));
    		}

    		if ($$self.$$.dirty[0] & /*flip*/ 1073741824 | $$self.$$.dirty[1] & /*tickPositions, xAbs, tickSize*/ 69664) {
    			$$invalidate(24, tickCoordinates = getTickCoordinatesYAxis(tickPositions, xAbs, tickSize, flip));
    		}

    		if ($$self.$$.dirty[0] & /*ticks*/ 16 | $$self.$$.dirty[1] & /*labelFormat, $section*/ 131136) {
    			// Tick labels
    			$$invalidate(46, format = getFormat(labelFormat, $section.scaleY, ticks.length));
    		}

    		if ($$self.$$.dirty[1] & /*tickPositions, format*/ 98304) {
    			$$invalidate(23, tickLabelText = tickPositions.map(format));
    		}

    		if ($$self.$$.dirty[0] & /*tickCoordinates, flip*/ 1090519040 | $$self.$$.dirty[1] & /*labelOffset*/ 128) {
    			$$invalidate(27, tickLabelCoordinates = getTickLabelCoordinatesYAxis(tickCoordinates, labelOffset, flip));
    		}

    		if ($$self.$$.dirty[0] & /*flip*/ 1073741824) {
    			$$invalidate(26, labelAnchorPoint = flip ? 'l' : 'r');
    		}

    		if ($$self.$$.dirty[0] & /*tickLabelText, labelFontSize, labelFont*/ 8390144) {
    			$$invalidate(45, tickLabelWidth = getTextWidth(tickLabelText[tickLabelText.length - 1], labelFontSize, labelFont));
    		}

    		if ($$self.$$.dirty[0] & /*baseLineWidth*/ 8 | $$self.$$.dirty[1] & /*tickSize, labelOffset, tickLabelWidth*/ 16544) {
    			// Title
    			$$invalidate(44, axisWidth = baseLineWidth + tickSize + labelOffset + tickLabelWidth);
    		}

    		if ($$self.$$.dirty[0] & /*flip, titleFontSize*/ 1073872896 | $$self.$$.dirty[1] & /*titleHjust, titleXOffset, titleVjust, titleYOffset, $section, axisWidth, xAbs*/ 147200) {
    			$$invalidate(25, titleCoordinates = getTitleCoordinatesYAxis(titleHjust, titleXOffset, titleVjust, titleYOffset, $section, flip, axisWidth, titleFontSize, xAbs));
    		}
    	};

    	return [
    		baseLine,
    		baseLineColor,
    		baseLineOpacity,
    		baseLineWidth,
    		ticks,
    		tickWidth,
    		tickColor,
    		tickOpacity,
    		labelRotate,
    		labelFont,
    		labelFontSize,
    		labelFontWeight,
    		labelOpacity,
    		labelColor,
    		title,
    		titleColor,
    		titleFont,
    		titleFontSize,
    		titleFontWeight,
    		titleOpacity,
    		titleRotate,
    		titleAnchorPoint,
    		clip,
    		tickLabelText,
    		tickCoordinates,
    		titleCoordinates,
    		labelAnchorPoint,
    		tickLabelCoordinates,
    		baseLineCoordinates,
    		section,
    		flip,
    		hjust,
    		xOffset,
    		tickCount,
    		tickExtra,
    		tickValues,
    		tickSize,
    		labelFormat,
    		labelOffset,
    		titleHjust,
    		titleXOffset,
    		titleVjust,
    		titleYOffset,
    		xAbs,
    		axisWidth,
    		tickLabelWidth,
    		format,
    		tickPositions,
    		$section
    	];
    }

    class YAxis extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$1,
    			create_fragment$1,
    			safe_not_equal,
    			{
    				flip: 30,
    				baseLine: 0,
    				baseLineColor: 1,
    				baseLineOpacity: 2,
    				baseLineWidth: 3,
    				hjust: 31,
    				xOffset: 32,
    				ticks: 4,
    				tickCount: 33,
    				tickExtra: 34,
    				tickValues: 35,
    				tickSize: 36,
    				tickWidth: 5,
    				tickColor: 6,
    				tickOpacity: 7,
    				labelFormat: 37,
    				labelOffset: 38,
    				labelRotate: 8,
    				labelFont: 9,
    				labelFontSize: 10,
    				labelFontWeight: 11,
    				labelOpacity: 12,
    				labelColor: 13,
    				titleHjust: 39,
    				titleXOffset: 40,
    				titleVjust: 41,
    				titleYOffset: 42,
    				title: 14,
    				titleColor: 15,
    				titleFont: 16,
    				titleFontSize: 17,
    				titleFontWeight: 18,
    				titleOpacity: 19,
    				titleRotate: 20,
    				titleAnchorPoint: 21,
    				clip: 22
    			},
    			null,
    			[-1, -1]
    		);
    	}
    }

    function isColumnOriented (data) {
      if (data.constructor === Object) {
        const columns = Object.keys(data).map(key => data[key]);
        return columns.every(column => column.constructor === Array)
      }

      return false
    }

    function isRowOriented (data) {
      if (data.constructor === Array) {
        return data.every(row => row.constructor === Object)
      }

      return false
    }

    function isGeoJSON (data) {
      const hasCorrectType = data.type === 'FeatureCollection';
      const hasCorrectFeatures = data.features && data.features.length > 0;

      return hasCorrectType && hasCorrectFeatures
    }

    function checkFormatColumnData (data) {
      checkFormat(data, { internal: false });
    }

    function checkFormatInternal (data) {
      checkFormat(data, { internal: true });
    }

    function checkFormat (data, { internal }) {
      let dataLength = null;
      const columnNameChecker = internal
        ? checkInternalDataColumnName
        : checkRegularColumnName;

      for (const columnName in data) {
        columnNameChecker(columnName);
        const column = data[columnName];

        dataLength = dataLength || column.length;

        if (internal === false && dataLength === 0) {
          throw new Error('Invalid data: columns cannot be empty')
        }

        if (dataLength !== column.length) {
          throw new Error('Invalid data: columns must be of same length')
        }
      }
    }

    function checkRegularColumnName (columnName) {
      if (columnName.match(forbiddenChars)) {
        throw new Error(`Invalid column name '${columnName}': '$' is not allowed in column names`)
      }
    }

    const forbiddenChars = /[/$]/;

    function checkInternalDataColumnName (columnName) {
      if (!['$key', '$geometry', '$grouped'].includes(columnName)) {
        checkRegularColumnName(columnName);
      }
    }

    function convertRowToColumnData (data) {
      checkIfDataIsEmpty(data);
      let columnData = initColumnData(data);

      for (let row of data) {
        for (let key in row) {
          columnData[key].push(row[key]);
        }
      }

      return columnData
    }

    function initColumnData (data) {
      let firstRow = data[0];
      let columnKeys = Object.keys(firstRow);
      let columnData = {};

      for (let key of columnKeys) {
        columnData[key] = [];
      }

      return columnData
    }

    function checkIfDataIsEmpty (data) {
      if (data.length === 0) {
        throw new Error('Received empty Array while trying to load row-oriented data. This is not allowed.')
      }
    }

    function parseGeoJSON (geojsonData) {
      const geometryData = [];
      const data = {};

      const features = geojsonData.features;
      const firstFeature = features[0];

      if ('properties' in firstFeature) {
        for (const columnName in firstFeature.properties) {
          data[columnName] = [];
        }
      }

      for (let i = 0; i < features.length; i++) {
        const { geometry, properties } = features[i];
        geometryData.push(geometry);

        for (const columnName in properties) {
          data[columnName].push(properties[columnName]);
        }
      }

      checkFormatColumnData(data);

      data.$geometry = geometryData;

      return data
    }

    const methods = {
      _setColumnData (data, options) {
        if (options.validate === false) {
          checkFormatInternal(data);
        } else {
          checkFormatColumnData(data);
        }

        this._storeData(data, options);
      },

      _setRowData (rowData, options) {
        const columnData = convertRowToColumnData(rowData);
        this._setColumnData(columnData, options);
      },

      _setGeoJSON (geojsonData, options) {
        const data = parseGeoJSON(geojsonData);
        this._storeData(data, options);
      },

      _setGroup (group, options) {
        const data = group.data;
        checkFormatInternal(data);
        this._storeData(data, options);
      },

      _storeData (data, options) {
        this._data = data;

        this._setupKeyColumn();

        if (options.validate === true) {
          this.validateAllColumns();
        }
      }
    };

    function dataLoadingMixin (targetClass) {
      Object.assign(targetClass.prototype, methods);
    }

    function generateKeyColumn (length) {
      return new Array(length).fill(0).map((_, i) => i.toString())
    }

    function validateKeyColumn (keyColumn, requiredLength) {
      if (keyColumn.length !== requiredLength) {
        throw new Error('Key column must be of same length as rest of the data')
      }

      ensureUnique(keyColumn);
    }

    function ensureUnique (keyColumn) {
      if (keyColumn.length !== new Set(keyColumn).size) {
        throw new Error('Keys must be unique')
      }
    }

    function incrementKey (keyColumn) {
      let max = -Infinity;

      for (let i = 0; i < keyColumn.length; i++) {
        const keyInt = +keyColumn[i];
        max = keyInt > max ? keyInt : max;
      }

      max++;

      return max.toString()
    }

    function getDataLength (data) {
      const keys = Object.keys(data);

      const firstKey = keys[0] === '$key'
        ? keys[1]
        : keys[0];

      const firstColumn = data[firstKey];
      return firstColumn.length
    }

    const methods$1 = {
      keys () {
        return this.column('$key')
      },

      setKey (columnName) {
        this._keyColumn = columnName;
        this._keyToRowIndex.clear();

        const column = this.column(columnName);
        const length = getDataLength(this._data);
        validateKeyColumn(column, length);

        this._setKeyColumn(column);
      },

      resetKey () {
        this._keyToRowIndex.clear();
        this._keyColumn = null;
        delete this._data.$key;

        this._setupKeyColumn();
      },

      _setupKeyColumn () {
        const length = getDataLength(this._data);

        if ('$key' in this._data) {
          validateKeyColumn(this._data.$key, length);
          this._constructKeyToRowIndex();
        } else {
          const keyColumn = generateKeyColumn(length);
          this._setKeyColumn(keyColumn);
        }
      },

      _setKeyColumn (keyColumn) {
        this._data.$key = keyColumn;
        this._constructKeyToRowIndex();
      },

      _constructKeyToRowIndex () {
        const length = getDataLength(this._data);

        for (let i = 0; i < length; i++) {
          const key = this._data.$key[i];
          this._keyToRowIndex.set(key, i);
        }
      }
    };

    function keyMixin (targetClass) {
      Object.assign(targetClass.prototype, methods$1);
    }

    function filter (data, filterFunction) {
      const length = getDataLength(data);
      const newData = {};
      for (const colName in data) { newData[colName] = []; }

      for (let i = 0; i < length; i++) {
        const row = {};
        for (const colName in data) { row[colName] = data[colName][i]; }

        if (filterFunction(row, i) === true) {
          for (const colName in row) { newData[colName].push(row[colName]); }
        }
      }

      return newData
    }

    function select (data, selection) {
      if (selection.constructor === String) {
        selection = [selection];
      }

      if (selection.constructor === Array) {
        validateSelectionInstructions(data, selection);

        const newData = {};

        for (const columnName of selection) {
          newData[columnName] = data[columnName];
        }

        return newData
      } else {
        throw new Error('select can only be used with a string or array of strings')
      }
    }

    function validateSelectionInstructions (data, selection) {
      for (const columnName of selection) {
        if (!(columnName in data)) {
          throw new Error(`Column '${columnName}' not found`)
        }
      }
    }

    // This function comes from Turf's wonderful geospatial lib
    // We only need this single function and importing it from @turf/meta
    // doesn't work well for in-browser compilation
    // https://github.com/Turfjs/turf

    // The MIT License (MIT)

    // Copyright (c) 2019 Morgan Herlocker

    // Permission is hereby granted, free of charge, to any person obtaining a copy of
    // this software and associated documentation files (the "Software"), to deal in
    // the Software without restriction, including without limitation the rights to
    // use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
    // the Software, and to permit persons to whom the Software is furnished to do so,
    // subject to the following conditions:

    // The above copyright notice and this permission notice shall be included in all
    // copies or substantial portions of the Software.

    // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    // IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
    // FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
    // COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
    // IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
    // CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

    function coordEach (geojson, callback, excludeWrapCoord) {
      // Handles null Geometry -- Skips this GeoJSON
      if (geojson === null) return
      var j; var k; var l; var geometry; var stopG; var coords;
      var geometryMaybeCollection;
      var wrapShrink = 0;
      var coordIndex = 0;
      var isGeometryCollection;
      var type = geojson.type;
      var isFeatureCollection = type === 'FeatureCollection';
      var isFeature = type === 'Feature';
      var stop = isFeatureCollection ? geojson.features.length : 1;

      // This logic may look a little weird. The reason why it is that way
      // is because it's trying to be fast. GeoJSON supports multiple kinds
      // of objects at its root: FeatureCollection, Features, Geometries.
      // This function has the responsibility of handling all of them, and that
      // means that some of the `for` loops you see below actually just don't apply
      // to certain inputs. For instance, if you give this just a
      // Point geometry, then both loops are short-circuited and all we do
      // is gradually rename the input until it's called 'geometry'.
      //
      // This also aims to allocate as few resources as possible: just a
      // few numbers and booleans, rather than any temporary arrays as would
      // be required with the normalization approach.
      for (var featureIndex = 0; featureIndex < stop; featureIndex++) {
        geometryMaybeCollection = (isFeatureCollection ? geojson.features[featureIndex].geometry
          : (isFeature ? geojson.geometry : geojson));
        isGeometryCollection = (geometryMaybeCollection) ? geometryMaybeCollection.type === 'GeometryCollection' : false;
        stopG = isGeometryCollection ? geometryMaybeCollection.geometries.length : 1;

        for (var geomIndex = 0; geomIndex < stopG; geomIndex++) {
          var multiFeatureIndex = 0;
          var geometryIndex = 0;
          geometry = isGeometryCollection
            ? geometryMaybeCollection.geometries[geomIndex] : geometryMaybeCollection;

          // Handles null Geometry -- Skips this geometry
          if (geometry === null) continue
          coords = geometry.coordinates;
          var geomType = geometry.type;

          wrapShrink = (excludeWrapCoord && (geomType === 'Polygon' || geomType === 'MultiPolygon')) ? 1 : 0;

          switch (geomType) {
            case null:
              break
            case 'Point':
              if (callback(coords, coordIndex, featureIndex, multiFeatureIndex, geometryIndex) === false) return false
              coordIndex++;
              multiFeatureIndex++;
              break
            case 'LineString':
            case 'MultiPoint':
              for (j = 0; j < coords.length; j++) {
                if (callback(coords[j], coordIndex, featureIndex, multiFeatureIndex, geometryIndex) === false) return false
                coordIndex++;
                if (geomType === 'MultiPoint') multiFeatureIndex++;
              }
              if (geomType === 'LineString') multiFeatureIndex++;
              break
            case 'Polygon':
            case 'MultiLineString':
              for (j = 0; j < coords.length; j++) {
                for (k = 0; k < coords[j].length - wrapShrink; k++) {
                  if (callback(coords[j][k], coordIndex, featureIndex, multiFeatureIndex, geometryIndex) === false) return false
                  coordIndex++;
                }
                if (geomType === 'MultiLineString') multiFeatureIndex++;
                if (geomType === 'Polygon') geometryIndex++;
              }
              if (geomType === 'Polygon') multiFeatureIndex++;
              break
            case 'MultiPolygon':
              for (j = 0; j < coords.length; j++) {
                geometryIndex = 0;
                for (k = 0; k < coords[j].length; k++) {
                  for (l = 0; l < coords[j][k].length - wrapShrink; l++) {
                    if (callback(coords[j][k][l], coordIndex, featureIndex, multiFeatureIndex, geometryIndex) === false) return false
                    coordIndex++;
                  }
                  geometryIndex++;
                }
                multiFeatureIndex++;
              }
              break
            case 'GeometryCollection':
              for (j = 0; j < geometry.geometries.length; j++) { if (coordEach(geometry.geometries[j], callback, excludeWrapCoord) === false) return false }
              break
            default:
              throw new Error('Unknown Geometry Type')
          }
        }
      }
    }

    function calculateBBoxGeometries (geometries) {
      let bbox = { x: [Infinity, -Infinity], y: [Infinity, -Infinity] };

      for (let i = 0; i < geometries.length; i++) {
        bbox = updateBBox(bbox, geometries[i]);
      }

      return bbox
    }

    function updateBBox ({ x, y }, geometry) {
      coordEach(geometry, coord => {
        x[0] = Math.min(coord[0], x[0]);
        x[1] = Math.max(coord[0], x[1]);
        y[0] = Math.min(coord[1], y[0]);
        y[1] = Math.max(coord[1], y[1]);
      });

      return { x, y }
    }

    function isInvalid (value) {
      if (value === undefined || value === null) { return true }

      if (value.constructor === Number) {
        return !isFinite(value)
      }

      return false
    }

    function isDefined (value) {
      return value !== undefined
    }

    function isUndefined (value) {
      return value === undefined
    }

    function warn (message) {
      if (typeof process === 'undefined') console.warn(message);

      if (typeof process === 'object' && process.env.NODE_ENV !== 'test') {
        console.warn(message);
      }
    }

    function calculateDomain (column, columnName) {
      if (columnName === '$grouped') {
        throw new Error(`Cannot calculate domain of column '${columnName}'.`)
      }

      if (column.length === 0) {
        return createEmptyDomain(columnName)
      }

      const { firstValidValue, nValidValues } = findFirstValidValue(column);

      if (nValidValues === 0) {
        throw new Error(`Cannot calculate domain of column '${column}'. Column contains only missing values.`)
      }

      if (nValidValues > 0) {
        ensureValidDataType(firstValidValue);
        const type = getDataType(firstValidValue);

        if (columnName === '$geometry') {
          return calculateBBoxGeometries(column)
        }

        if (columnName !== '$geometry') {
          return calculateNonGeometryColumnDomain(column, columnName, nValidValues, firstValidValue, type)
        }
      }
    }

    function createEmptyDomain (columnName) {
      if (columnName === '$geometry') {
        return { x: [], y: [] }
      }

      if (columnName !== '$geometry') {
        return []
      }
    }

    function findFirstValidValue (column) {
      let firstValidValue;
      let nValidValues = 0;

      for (let i = 0; i < column.length; i++) {
        if (!isInvalid(column[i])) {
          nValidValues++;
          firstValidValue = firstValidValue || column[i];
        }

        if (nValidValues > 1) break
      }

      return { firstValidValue, nValidValues }
    }

    function calculateNonGeometryColumnDomain (column, columnName, nValidValues, firstValidValue, type) {
      let domain;
      const nUniqueValues = calculateNumberOfUniqueValues(column, type);

      if (columnHasOnlyOneUniqueValue(nValidValues, nUniqueValues)) {
        domain = calculateDomainForColumnWithOneUniqueValue(
          nValidValues, nUniqueValues, type, firstValidValue, columnName
        );
      } else {
        domain = calculateDomainForRegularColumn(type, column, columnName);
      }

      return domain
    }

    function calculateNumberOfUniqueValues (col, type) {
      const uniqueVals = {};

      if (['quantitative', 'categorical'].includes(type)) {
        for (let i = 0; i < col.length; i++) {
          const val = col[i];
          if (!isInvalid(val)) {
            uniqueVals[val] = 0;
          }
        }
      }

      if (type === 'temporal') {
        for (let i = 0; i < col.length; i++) {
          const val = col[i];
          if (!isInvalid(val)) {
            uniqueVals[val.getTime()] = 0;
          }
        }
      }

      if (type === 'interval') {
        for (let i = 0; i < col.length; i++) {
          const val = col[i];
          if (!isInvalid(val)) {
            const str = JSON.stringify(val);
            uniqueVals[str] = 0;
          }
        }
      }

      return Object.keys(uniqueVals).length
    }

    function columnHasOnlyOneUniqueValue (nValidValues, nUniqueValues) {
      return nValidValues === 1 || nUniqueValues === 1
    }

    function calculateDomainForColumnWithOneUniqueValue (nValidValues, nUniqueValues, type, firstValidValue, columnName) {
      const domain = createDomainForSingleValue(type, firstValidValue);
      const warningText = nValidValues === 1 ? 'valid' : 'unique';

      if (type !== 'categorical') {
        warn(
          `Column '${columnName}' contains only 1 ${warningText} value: ${firstValidValue}.\n` +
          `Using domain ${JSON.stringify(domain)}`
        );
      }

      return domain
    }

    function calculateDomainForRegularColumn (type, column, columnName) {
      let domain = initDomain(type);

      for (let i = 0; i < column.length; i++) {
        const value = column[i];

        if (!isInvalid(value)) {
          if (getDataType(value) !== type) {
            throw new Error(`Invalid column ${columnName}: column contains multiple data types`)
          }

          domain = updateDomain(domain, value, type);
        }
      }

      return domain
    }

    const minUnixTime = new Date(0);
    const maxUnixTime = new Date('19 January 2038');

    function initDomain (type) {
      let domain;
      switch (type) {
        case 'quantitative': {
          domain = [Infinity, -Infinity];
          break
        }
        case 'categorical': {
          domain = [];
          break
        }
        case 'temporal': {
          domain = [maxUnixTime, minUnixTime];
          break
        }
        case 'interval': {
          domain = [Infinity, -Infinity];
          break
        }
      }

      return domain
    }

    function updateDomain (domain, value, type) {
      if (!['quantitative', 'categorical', 'temporal', 'interval'].includes(type)) {
        throw new Error(`Cannot set domain for column of type '${type}'`)
      }

      if (type === 'quantitative') {
        if (domain[0] >= value) { domain[0] = value; }
        if (domain[1] <= value) { domain[1] = value; }
      }

      if (type === 'categorical') {
        if (!domain.includes(value)) { domain.push(value); }
      }

      if (type === 'temporal') {
        const epoch = value.getTime();

        if (domain[0].getTime() >= epoch) { domain[0] = value; }
        if (domain[1].getTime() <= epoch) { domain[1] = value; }
      }

      if (type === 'interval') {
        domain = updateDomain(domain, value[0], 'quantitative');
        domain = updateDomain(domain, value[1], 'quantitative');
      }

      return domain
    }

    function createDomainForSingleValue (type, value) {
      let domain;

      if (type === 'quantitative') {
        domain = [value - 1, value + 1];
      }

      if (type === 'categorical') {
        domain = [value];
      }

      if (type === 'temporal') {
        domain = [getDay(value, -1), getDay(value, 1)];
      }

      if (type === 'interval') {
        domain = value.sort((a, b) => a - b);
      }

      return domain
    }

    function getDay (date, days) {
      const dateCopy = new Date(date.getTime());
      return new Date(dateCopy.setDate(dateCopy.getDate() + days))
    }

    function getColumnType (column) {
      const { firstValidValue } = findFirstValidValue(column);
      return getDataType(firstValidValue)
    }

    function getDataType (value) {
      if (isInvalid(value)) return undefined

      if (value.constructor === Number) return 'quantitative'
      if (value.constructor === String) return 'categorical'
      if (value.constructor === Date) return 'temporal'
      if (isInterval(value)) return 'interval'
      if (isGeometry(value)) return 'geometry'
      if (value.constructor === DataContainer) return 'grouped'

      return undefined
    }

    function ensureValidDataType (value) {
      if (isInvalid(getDataType(value))) {
        throw new Error('Invalid data')
      }
    }

    function isGeometry (value) {
      return value.constructor === Object && 'type' in value && 'coordinates' in value
    }

    function isInterval (value) {
      return value.constructor === Array && value.length === 2 && value.every(entry => entry.constructor === Number)
    }

    function arrange (data, sortInstructions) {
      if (sortInstructions.constructor === Object) {
        return sort(data, sortInstructions)
      } else if (sortInstructions.constructor === Array) {
        let newData;

        for (let i = sortInstructions.length - 1; i >= 0; i--) {
          const instruction = sortInstructions[i];

          newData = sort(
            newData ? data : newData,
            instruction
          );
        }

        return newData
      } else {
        throw new Error('arrange requires a key-value object or array of key-value objects')
      }
    }

    const sortFuncs = {
      quantitative: {
        // https://beta.observablehq.com/@mbostock/manipulating-flat-arrays
        ascending: (a, b) => a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN,
        descending: (a, b) => b < a ? -1 : b > a ? 1 : b >= a ? 0 : NaN
      },
      categorical: {
        ascending: (a, b) => {
          const sorted = [a, b].sort();
          return sorted[0] === a ? -1 : 1
        },
        descending: (a, b) => {
          const sorted = [a, b].sort();
          return sorted[0] === a ? 1 : -1
        }
      },
      temporal: {
        ascending: (a, b) => {
          return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN
        },
        descending: (a, b) => {
          return b < a ? -1 : b > a ? 1 : b >= a ? 0 : NaN
        }
      }
    };

    function sort (data, sortInstructions) {
      if (Object.keys(sortInstructions).length !== 1) {
        throw new Error('Only one key-value pair allowed')
      }

      const variable = Object.keys(sortInstructions)[0];
      const sortMethod = sortInstructions[variable];

      ensureValidDataType(data[variable][0]);
      const dataType = getDataType(data[variable][0]);

      let sortFunc;
      if (sortMethod.constructor === String) {
        sortFunc = sortFuncs[dataType][sortMethod];
      }
      if (sortMethod.constructor === Function) {
        sortFunc = sortMethod;
      }

      const column = data[variable];

      const indices = column.map((v, i) => i);
      const sortedIndices = indices.sort((a, b) => sortFunc(column[a], column[b]));

      const newData = {};

      for (const colName in data) {
        newData[colName] = reorder(data[colName], sortedIndices);
      }

      return newData
    }

    function reorder (column, indices) {
      return indices.map(i => column[i])
    }

    function rename (data, renameInstructions) {
      if (renameInstructions.constructor !== Object) {
        throw new Error('Rename only accepts an object')
      }

      const newData = Object.assign({}, data);

      for (const oldName in renameInstructions) {
        if (oldName in data) {
          const newName = renameInstructions[oldName];
          checkRegularColumnName(newName);

          newData[newName] = newData[oldName];
          delete newData[oldName];
        } else {
          warn(`Rename: column '${oldName}' not found`);
        }
      }

      return newData
    }

    function mutate (data, mutateInstructions) {
      const length = getDataLength(data);
      const newData = initNewData(data, mutateInstructions);

      for (let i = 0; i < length; i++) {
        const row = {};

        for (const columnName in data) {
          row[columnName] = data[columnName][i];
        }

        for (const columnName in mutateInstructions) {
          const mutateFunction = mutateInstructions[columnName];
          newData[columnName][i] = mutateFunction(row, i);
        }
      }

      return newData
    }

    function transmute (data, transmuteInstructions) {
      const newData = mutate(data, transmuteInstructions);

      for (const columnName in newData) {
        if (!(columnName in transmuteInstructions)) {
          delete newData[columnName];
        }
      }

      return newData
    }

    function initNewData (data, mutateInstructions) {
      const length = getDataLength(data);
      const newData = Object.assign({}, data);

      const dataColumns = new Set(Object.keys(data));
      const mutateColumns = new Set(Object.keys(mutateInstructions));

      for (const columnName of mutateColumns) {
        if (!dataColumns.has(columnName)) {
          newData[columnName] = new Array(length).fill(undefined);
        }
      }

      return newData
    }

    var aggregations = {
      count,
      sum,
      mean,
      median,
      mode,
      min,
      max
    };

    function count (column) {
      return column.length
    }

    function sum (column) {
      let total = 0;
      for (const value of column) {
        total += value;
      }

      return total
    }

    function mean (column) {
      return sum(column) / count(column)
    }

    function median (column) {
      const asc = column.sort((a, b) => a > b);
      const len = count(column);

      if (len % 2 === 1) {
        // Odd
        return asc[Math.floor(len / 2)]
      } else {
        // Even
        const lower = asc[(len / 2) - 1];
        const upper = asc[(len / 2)];
        return (lower + upper) / 2
      }
    }

    function mode (column) {
      const counts = {};

      for (const value of column) {
        if (value in counts) {
          counts[value]++;
        } else {
          counts[value] = 1;
        }
      }

      let winner;
      let winningVal = 0;

      for (const value in counts) {
        if (counts[value] > winningVal) {
          winningVal = counts[value];
          winner = value;
        }
      }

      return winner
    }

    function min (column) {
      let winner = Infinity;
      for (const value of column) {
        if (value < winner) { winner = value; }
      }
      return winner
    }

    function max (column) {
      let winner = -Infinity;
      for (const value of column) {
        if (value > winner) { winner = value; }
      }
      return winner
    }

    function checkKeyValuePair (obj, allowedKeys) {
      const keys = Object.keys(obj);
      if (keys.length !== 1) {
        throw new Error('Invalid transformation syntax')
      }

      const key = keys[0];

      if (!allowedKeys.includes(key)) {
        throw new Error(`Unknown column ${key}`)
      }

      return key
    }

    function summarise (data, summariseInstructions) {
      if (summariseInstructions.constructor !== Object) {
        throw new Error('summarise must be an object')
      }

      let newData = initNewData$1(summariseInstructions, data);

      if ('$grouped' in data) {
        checkSummariseInstructions(summariseInstructions, data);

        for (const columnName in data) {
          if (columnName !== '$grouped') {
            newData[columnName] = data[columnName];
          }
        }

        for (const group of data.$grouped) {
          const data = group.data();
          newData = summariseGroup(data, summariseInstructions, newData);
        }
      } else {
        newData = summariseGroup(data, summariseInstructions, newData);
      }
      return newData
    }

    function initNewData$1 (summariseInstructions, data) {
      const newData = {};
      for (const newCol in summariseInstructions) { newData[newCol] = []; }
      if (data && '$grouped' in data) {
        for (const col in data) {
          if (col !== '$grouped') {
            newData[col] = [];
          }
        }
      }
      return newData
    }

    function summariseGroup (data, summariseInstructions, newData) {
      for (const newColName in summariseInstructions) {
        const instruction = summariseInstructions[newColName];

        if (instruction.constructor === Object) {
          const column = checkKeyValuePair(instruction, Object.keys(data));
          const aggregation = instruction[column];

          if (aggregation.constructor === String) {
            if (!(aggregation in aggregations)) {
              throw new Error(`Unkown summaryMethod: '${aggregation}'.`)
            }

            newData[newColName].push(aggregations[aggregation](data[column]));
          } else if (aggregation.constructor === Function) {
            newData[newColName].push(aggregation(data[column]));
          } else {
            throw new Error(`Invalid summaryMethod: '${aggregation}'. Must be String or Function`)
          }
        }
      }

      return newData
    }

    function checkSummariseInstructions (summariseInstructions, data) {
      for (const newColName in summariseInstructions) {
        const instruction = summariseInstructions[newColName];
        const name = Object.keys(instruction)[0];

        checkRegularColumnName(name);

        if (name in data) {
          throw new Error(`Cannot summarise the column '${name}': used for grouping`)
        }
      }
    }

    function mutarise (data, mutariseInstructions) {
      if (mutariseInstructions.constructor !== Object) {
        throw new Error('mutarise must be an object')
      }

      let newCols = initNewData$1(mutariseInstructions);

      if ('$grouped' in data) {
        checkSummariseInstructions(mutariseInstructions, data);

        for (const group of data.$grouped) {
          let summarizedData = initNewData$1(mutariseInstructions);
          const dataInGroup = group.data();
          summarizedData = summariseGroup(dataInGroup, mutariseInstructions, summarizedData);

          const length = getDataLength(dataInGroup);
          newCols = addGroupSummaries(newCols, summarizedData, length);
        }

        data = ungroup(data);
      } else {
        let summarizedData = initNewData$1(mutariseInstructions);
        summarizedData = summariseGroup(data, mutariseInstructions, summarizedData);

        const length = getDataLength(data);
        newCols = addGroupSummaries(newCols, summarizedData, length);
      }

      return join(data, newCols)
    }

    function addGroupSummaries (newCols, summarizedData, length) {
      for (let i = 0; i < length; i++) {
        for (const key in summarizedData) {
          newCols[key].push(summarizedData[key][0]);
        }
      }

      return newCols
    }

    function ungroup (data) {
      const newData = initNewData$1(data.$grouped[0].data());

      for (const group of data.$grouped) {
        const groupData = group.data();
        for (const col in newData) {
          newData[col].push(...groupData[col]);
        }
      }

      return newData
    }

    function join (data, newCols) {
      for (const col in newCols) {
        data[col] = newCols[col];
      }

      return data
    }

    function groupBy (data, groupByInstructions) {
      const groupedData = {};

      const groupedColumns = getGroupedColumns(data, groupByInstructions);
      const groups = groupBy$1(data, groupedColumns);

      groupedData.$grouped = groups.map(group => new DataContainer(group));
      for (const col of groupedColumns) {
        groupedData[col] = [];
      }

      for (let i = 0; i < groupedColumns.length; i++) {
        const col = groupedColumns[i];

        for (const group of groups) {
          groupedData[col].push(group.groupedValues[i]);
        }
      }

      return groupedData
    }

    function getGroupedColumns (data, groupByInstructions) {
      const con = groupByInstructions.constructor;
      if (![String, Array].includes(con)) {
        throw new Error('groupBy can only be used with a string or array of strings')
      }

      const groupedColumns = con === String ? [groupByInstructions] : groupByInstructions;

      for (const col of groupedColumns) {
        if (!(col in data)) {
          throw new Error(`Column '${col}' not found`)
        }
      }

      if (groupedColumns.length === Object.keys(data).length) {
        throw new Error('Cannot group by all columns')
      }

      return groupedColumns
    }

    function getGroupedValues (data, i, columns) {
      const groupedValues = [];
      for (const col of columns) {
        groupedValues.push(data[col][i]);
      }

      return groupedValues
    }

    function groupBy$1 (data, groupedColumns) {
      const groups = {};

      const length = getDataLength(data);

      for (let i = 0; i < length; i++) {
        // Ge grouped values
        const groupedValues = getGroupedValues(data, i, groupedColumns);

        // Get unique identifier for group
        const groupID = JSON.stringify(groupedValues);

        // If groups object has no entry for this group yet: create new group object
        groups[groupID] = groups[groupID] || new Group(data, groupedValues);

        // Add row to group
        groups[groupID].addRow(data, i);
      }

      // Convert groups object to array
      return Object.keys(groups).map(group => {
        return groups[group]
      })
    }

    class Group {
      constructor (data, groupedValues) {
        this.data = {};
        this.groupedValues = groupedValues;

        for (const col in data) {
          this.data[col] = [];
        }
      }

      addRow (data, i) {
        for (const col in data) {
          this.data[col].push(data[col][i]);
        }
      }
    }

    /**
     * Classify the series in equal intervals from minimum to maximum value.
     * @param {array} serie
     * @param {number} nbClass
     * @param {number} forceMin
     * @param {number} forceMax
     */
    const classifyEqInterval = (serie, nbClass, forceMin, forceMax) => {
      if (serie.length === 0) {
        return []
      }

      const tmpMin = typeof forceMin === 'undefined' ? Math.min(...serie) : forceMin;
      const tmpMax = typeof forceMax === 'undefined' ? Math.max(...serie) : forceMax;

      const bounds = [];
      const interval = (tmpMax - tmpMin) / nbClass;
      let val = tmpMin;

      for (let i = 0; i <= nbClass; i++) {
        bounds.push(val);
        val += interval;
      }

      bounds[nbClass] = tmpMax;

      return bounds
    };

    /**
     * Based on jenks implementation of geostats
     * https://github.com/simogeo/geostats
     * https://raw.githubusercontent.com/simogeo/geostats/a5b2b89a7bef3c412468bb1062e3cf00ffdae0ea/lib/geostats.js
     */
    const classifyJenks = (serie, nbClass) => {
      if (serie.length === 0) {
        return []
      }

      serie.sort((a, b) => a - b);

      // define two matrices mat1, mat2
      const height = serie.length + 1;
      const width = nbClass + 1;
      const mat1 = Array(height)
        .fill()
        .map(() => Array(width).fill(0));
      const mat2 = Array(height)
        .fill()
        .map(() => Array(width).fill(0));

      // initialize mat1, mat2
      for (let y = 1; y < nbClass + 1; y++) {
        mat1[0][y] = 1;
        mat2[0][y] = 0;
        for (let t = 1; t < serie.length + 1; t++) {
          mat2[t][y] = Infinity;
        }
      }

      // fill matrices
      for (let l = 2; l < serie.length + 1; l++) {
        let s1 = 0.0;
        let s2 = 0.0;
        let w = 0.0;
        let v = 0.0;
        for (let m = 1; m < l + 1; m++) {
          const i3 = l - m + 1;
          const val = parseFloat(serie[i3 - 1]);
          s2 += val * val;
          s1 += val;
          w += 1;
          v = s2 - (s1 * s1) / w;
          const i4 = i3 - 1;
          if (i4 !== 0) {
            for (let p = 2; p < nbClass + 1; p++) {
              if (mat2[l][p] >= v + mat2[i4][p - 1]) {
                mat1[l][p] = i3;
                mat2[l][p] = v + mat2[i4][p - 1];
              }
            }
          }
        }
        mat1[l][1] = 1;
        mat2[l][1] = v;
      }

      const bounds = [];
      bounds.push(serie[serie.length - 1]);
      let k = serie.length;
      for (let i = nbClass; i >= 2; i--) {
        const idx = parseInt(mat1[k][i] - 2);
        bounds.push(serie[idx]);
        k = parseInt(mat1[k][i] - 1);
      }
      bounds.push(serie[0]);

      return bounds.reverse()
    };

    const classifyQuantile = (serie, nbClass) => {
      if (serie.length === 0) {
        return []
      }

      serie.sort((a, b) => a - b);
      const bounds = [];

      bounds.push(serie[0]);
      const step = serie.length / nbClass;
      for (let i = 1; i < nbClass; i++) {
        const qidx = Math.round(i * step + 0.49);
        bounds.push(serie[qidx - 1]);
      }
      bounds.push(serie[serie.length - 1]);

      return bounds
    };

    const mean$1 = (serie) => {
      const sum = serie.reduce((sum, val) => sum + val, 0);
      return sum / serie.length
    };

    const variance = (serie) => {
      let tmp = 0;
      for (let i = 0; i < serie.length; i++) {
        tmp += Math.pow(serie[i] - mean$1(serie), 2);
      }
      return tmp / serie.length
    };

    const stddev = (serie) => {
      return Math.sqrt(variance(serie))
    };

    const classifyStdDeviation = (serie, nbClass) => {
      if (serie.length === 0) {
        return []
      }

      const _mean = mean$1(serie);
      const _stddev = stddev(serie);

      const bounds = [];

      // number of classes is odd
      if (nbClass % 2 === 1) {
        // Euclidean division to get the inferior bound
        const infBound = Math.floor(nbClass / 2);
        const supBound = infBound + 1;
        // we set the central bounds
        bounds[infBound] = _mean - _stddev / 2;
        bounds[supBound] = _mean + _stddev / 2;
        // Values < to infBound, except first one
        for (let i = infBound - 1; i > 0; i--) {
          const val = bounds[i + 1] - _stddev;
          bounds[i] = val;
        }
        // Values > to supBound, except last one
        for (let i = supBound + 1; i < nbClass; i++) {
          const val = bounds[i - 1] + _stddev;
          bounds[i] = val;
        }

        // number of classes is even
      } else {
        const meanBound = nbClass / 2;
        // we get the mean value
        bounds[meanBound] = _mean;
        // Values < to the mean, except first one
        for (let i = meanBound - 1; i > 0; i--) {
          const val = bounds[i + 1] - _stddev;
          bounds[i] = val;
        }
        // Values > to the mean, except last one
        for (let i = meanBound + 1; i < nbClass; i++) {
          const val = bounds[i - 1] + _stddev;
          bounds[i] = val;
        }
      }
      // set first value
      bounds[0] = Math.min(...serie);
      // set last value
      bounds[nbClass] = Math.max(...serie);

      return bounds
    };

    const numericSort = arr => arr.slice().sort((a, b) => a - b);
    const uniqueCountSorted = arr => new Set(arr).size;

    /**
     * Based on https://github.com/simple-statistics/simple-statistics/blob/master/src/ckmeans.js

     * Ckmeans clustering is an improvement on heuristic-based clustering
     * approaches like Jenks. The algorithm was developed in
     * [Haizhou Wang and Mingzhou Song](http://journal.r-project.org/archive/2011-2/RJournal_2011-2_Wang+Song.pdf)
     * as a [dynamic programming](https://en.wikipedia.org/wiki/Dynamic_programming) approach
     * to the problem of clustering numeric data into groups with the least
     * within-group sum-of-squared-deviations.
     *
     * Minimizing the difference within groups - what Wang & Song refer to as
     * `withinss`, or within sum-of-squares, means that groups are optimally
     * homogenous within and the data is split into representative groups.
     * This is very useful for visualization, where you may want to represent
     * a continuous variable in discrete color or style groups. This function
     * can provide groups that emphasize differences between data.
     *
     * Being a dynamic approach, this algorithm is based on two matrices that
     * store incrementally-computed values for squared deviations and backtracking
     * indexes.
     *
     * This implementation is based on Ckmeans 3.4.6, which introduced a new divide
     * and conquer approach that improved runtime from O(kn^2) to O(kn log(n)).
     *
     * Unlike the [original implementation](https://cran.r-project.org/web/packages/Ckmeans.1d.dp/index.html),
     * this implementation does not include any code to automatically determine
     * the optimal number of clusters: this information needs to be explicitly
     * provided.
     *
     * ### References
     * _Ckmeans.1d.dp: Optimal k-means Clustering in One Dimension by Dynamic
     * Programming_ Haizhou Wang and Mingzhou Song ISSN 2073-4859
     *
     * from The R Journal Vol. 3/2, December 2011
     * @param {Array<number>} x input data, as an array of number values
     * @param {number} nClusters number of desired classes. This cannot be
     * greater than the number of values in the data array.
     * @returns {Array<Array<number>>} clustered input
     * @throws {Error} if the number of requested clusters is higher than the size of the data
     * @example
     * ckmeans([-1, 2, -1, 2, 4, 5, 6, -1, 2, -1], 3);
     * // The input, clustered into groups of similar numbers.
     * //= [[-1, -1, -1, -1], [2, 2, 2], [4, 5, 6]]);
     */
    function classifyCkmeans(x, nClusters) {
      if (nClusters > x.length) {
        return []
      }

      const sorted = numericSort(x);
      // we'll use this as the maximum number of clusters
      const uniqueCount = uniqueCountSorted(sorted);

      // if all of the input values are identical, there's one cluster
      // with all of the input in it.
      if (uniqueCount === 1) {
        return [sorted]
      }

      // named 'S' originally
      const matrix = makeMatrix(nClusters, sorted.length);
      // named 'J' originally
      const backtrackMatrix = makeMatrix(nClusters, sorted.length);

      // This is a dynamic programming way to solve the problem of minimizing
      // within-cluster sum of squares. It's similar to linear regression
      // in this way, and this calculation incrementally computes the
      // sum of squares that are later read.
      fillMatrices(sorted, matrix, backtrackMatrix);

      // The real work of Ckmeans clustering happens in the matrix generation:
      // the generated matrices encode all possible clustering combinations, and
      // once they're generated we can solve for the best clustering groups
      // very quickly.
      const clusters = [];
      let clusterRight = backtrackMatrix[0].length - 1;

      // Backtrack the clusters from the dynamic programming matrix. This
      // starts at the bottom-right corner of the matrix (if the top-left is 0, 0),
      // and moves the cluster target with the loop.
      for (let cluster = backtrackMatrix.length - 1; cluster >= 0; cluster--) {
        const clusterLeft = backtrackMatrix[cluster][clusterRight];

        // fill the cluster from the sorted input by taking a slice of the
        // array. the backtrack matrix makes this easy - it stores the
        // indexes where the cluster should start and end.
        clusters[cluster] = sorted.slice(clusterLeft, clusterRight + 1);

        if (cluster > 0) {
          clusterRight = clusterLeft - 1;
        }
      }

      const bounds = [];
      bounds.push(clusters[0][0]);
      for (const cluster of clusters) {
        bounds.push(cluster[cluster.length - 1]);
      }

      return bounds
    }
    /**
     * Create a new column x row matrix.
     *
     * @private
     * @param {number} columns
     * @param {number} rows
     * @return {Array<Array<number>>} matrix
     * @example
     * makeMatrix(10, 10);
     */
    function makeMatrix(columns, rows) {
      const matrix = [];
      for (let i = 0; i < columns; i++) {
        const column = [];
        for (let j = 0; j < rows; j++) {
          column.push(0);
        }
        matrix.push(column);
      }
      return matrix
    }

    /**
     * Generates incrementally computed values based on the sums and sums of
     * squares for the data array
     *
     * @private
     * @param {number} j
     * @param {number} i
     * @param {Array<number>} sums
     * @param {Array<number>} sumsOfSquares
     * @return {number}
     * @example
     * ssq(0, 1, [-1, 0, 2], [1, 1, 5]);
     */
    function ssq(j, i, sums, sumsOfSquares) {
      let sji; // s(j, i)
      if (j > 0) {
        const muji = (sums[i] - sums[j - 1]) / (i - j + 1); // mu(j, i)
        sji = sumsOfSquares[i] - sumsOfSquares[j - 1] - (i - j + 1) * muji * muji;
      } else {
        sji = sumsOfSquares[i] - (sums[i] * sums[i]) / (i + 1);
      }
      if (sji < 0) {
        return 0
      }
      return sji
    }

    /**
     * Function that recursively divides and conquers computations
     * for cluster j
     *
     * @private
     * @param {number} iMin Minimum index in cluster to be computed
     * @param {number} iMax Maximum index in cluster to be computed
     * @param {number} cluster Index of the cluster currently being computed
     * @param {Array<Array<number>>} matrix
     * @param {Array<Array<number>>} backtrackMatrix
     * @param {Array<number>} sums
     * @param {Array<number>} sumsOfSquares
     */
    function fillMatrixColumn(
      iMin,
      iMax,
      cluster,
      matrix,
      backtrackMatrix,
      sums,
      sumsOfSquares
    ) {
      if (iMin > iMax) {
        return
      }

      // Start at midpoint between iMin and iMax
      const i = Math.floor((iMin + iMax) / 2);

      matrix[cluster][i] = matrix[cluster - 1][i - 1];
      backtrackMatrix[cluster][i] = i;

      let jlow = cluster; // the lower end for j

      if (iMin > cluster) {
        jlow = Math.max(jlow, backtrackMatrix[cluster][iMin - 1] || 0);
      }
      jlow = Math.max(jlow, backtrackMatrix[cluster - 1][i] || 0);

      let jhigh = i - 1; // the upper end for j
      if (iMax < matrix.length - 1) {
        jhigh = Math.min(jhigh, backtrackMatrix[cluster][iMax + 1] || 0);
      }

      let sji;
      let sjlowi;
      let ssqjlow;
      let ssqj;
      for (let j = jhigh; j >= jlow; --j) {
        sji = ssq(j, i, sums, sumsOfSquares);

        if (sji + matrix[cluster - 1][jlow - 1] >= matrix[cluster][i]) {
          break
        }

        // Examine the lower bound of the cluster border
        sjlowi = ssq(jlow, i, sums, sumsOfSquares);

        ssqjlow = sjlowi + matrix[cluster - 1][jlow - 1];

        if (ssqjlow < matrix[cluster][i]) {
          // Shrink the lower bound
          matrix[cluster][i] = ssqjlow;
          backtrackMatrix[cluster][i] = jlow;
        }
        jlow++;

        ssqj = sji + matrix[cluster - 1][j - 1];
        if (ssqj < matrix[cluster][i]) {
          matrix[cluster][i] = ssqj;
          backtrackMatrix[cluster][i] = j;
        }
      }

      fillMatrixColumn(
        iMin,
        i - 1,
        cluster,
        matrix,
        backtrackMatrix,
        sums,
        sumsOfSquares
      );
      fillMatrixColumn(
        i + 1,
        iMax,
        cluster,
        matrix,
        backtrackMatrix,
        sums,
        sumsOfSquares
      );
    }

    /**
     * Initializes the main matrices used in Ckmeans and kicks
     * off the divide and conquer cluster computation strategy
     *
     * @private
     * @param {Array<number>} data sorted array of values
     * @param {Array<Array<number>>} matrix
     * @param {Array<Array<number>>} backtrackMatrix
     */
    function fillMatrices(data, matrix, backtrackMatrix) {
      const nValues = matrix[0].length;

      // Shift values by the median to improve numeric stability
      const shift = data[Math.floor(nValues / 2)];

      // Cumulative sum and cumulative sum of squares for all values in data array
      const sums = [];
      const sumsOfSquares = [];

      // Initialize first column in matrix & backtrackMatrix
      for (let i = 0, shiftedValue; i < nValues; ++i) {
        shiftedValue = data[i] - shift;
        if (i === 0) {
          sums.push(shiftedValue);
          sumsOfSquares.push(shiftedValue * shiftedValue);
        } else {
          sums.push(sums[i - 1] + shiftedValue);
          sumsOfSquares.push(sumsOfSquares[i - 1] + shiftedValue * shiftedValue);
        }

        // Initialize for cluster = 0
        matrix[0][i] = ssq(0, i, sums, sumsOfSquares);
        backtrackMatrix[0][i] = 0;
      }

      // Initialize the rest of the columns
      let iMin;
      for (let cluster = 1; cluster < matrix.length; ++cluster) {
        if (cluster < matrix.length - 1) {
          iMin = cluster;
        } else {
          // No need to compute matrix[K-1][0] ... matrix[K-1][N-2]
          iMin = nValues - 1;
        }

        fillMatrixColumn(
          iMin,
          nValues - 1,
          cluster,
          matrix,
          backtrackMatrix,
          sums,
          sumsOfSquares
        );
      }
    }

    const methodMap = {
      EqualInterval: classifyEqInterval,
      StandardDeviation: classifyStdDeviation,
      Quantile: classifyQuantile,
      Jenks: classifyJenks,
      CKMeans: classifyCkmeans
    };

    function bin (data, binInstructions) {
      if (binInstructions.constructor === Object) {
        const intervalBounds = getIntervalBounds(data, binInstructions);
        const ranges = pairRanges(intervalBounds);

        return bin1d(data, binInstructions.column, ranges)
      }

      if (binInstructions.constructor === Array) {
        const intervalBoundsPerVariable = binInstructions.map(instructions => getIntervalBounds(data, instructions));
        const rangesPerVariable = intervalBoundsPerVariable.map(bounds => pairRanges(bounds));
        const variables = binInstructions.map(instructions => instructions.column);

        return binKd(data, variables, rangesPerVariable)
      }
    }

    function getIntervalBounds (data, binInstructions) {
      const { column, method, numClasses } = parseBinInstructions(binInstructions);

      const variableData = data[column];
      if (!variableData) {
        throw new Error(`Column '${column}' does not exist`)
      }

      if (method === 'IntervalSize') {
        return createRangesFromBinSize(variableData, binInstructions.binSize)
      }

      if (method === 'Manual') {
        return binInstructions.manualClasses
      }

      return methodMap[method](JSON.parse(JSON.stringify(variableData)), numClasses)
    }

    function parseBinInstructions (binInstructions) {
      if (binInstructions.constructor !== Object) {
        throw new Error('Bin only accepts an Object')
      }

      const column = binInstructions.column;
      if (column.constructor !== String) {
        throw new Error('column only accepts a String variable name')
      }

      return binInstructions
    }

    function createRangesFromBinSize (variableData, binSize) {
      if (!binSize) {
        throw new Error('Missing required option \'binSize\'')
      }

      const domain = calculateDomain(variableData);

      const binCount = Math.floor((domain[1] - domain[0]) / binSize);

      let lowerBound = domain[0];
      const ranges = [lowerBound];

      for (let i = 0; i < binCount - 1; i++) {
        const upperBound = lowerBound + binSize;
        ranges.push(upperBound);
        lowerBound = upperBound;
      }

      ranges.push(domain[1]);

      return ranges
    }

    function pairRanges (ranges) {
      const l = ranges.length;
      const newRange = [];

      for (let i = 0; i < l - 1; i++) {
        newRange.push([ranges[i], ranges[i + 1]]);
      }

      return newRange
    }

    function bin1d (data, variable, ranges) {
      // Create an empty array to store new groups divided by range
      const groups = Array(ranges.length);

      for (let i = 0; i < groups.length; i++) {
        groups[i] = {};

        for (const col in data) {
          groups[i][col] = [];
        }
      }

      const length = getDataLength(data);

      for (let i = 0; i < length; i++) {
        const value = data[variable][i];
        const binIndex = getBinIndex(ranges, value);

        if (binIndex !== -1) {
          for (const col in data) {
            groups[binIndex][col].push(data[col][i]);
          }
        }
      }

      // Remove empty bins
      const nonEmptyBinIndices = getNonEmptyBinIndices(groups);
      const nonEmptyRanges = nonEmptyBinIndices.map(i => ranges[i]);
      const nonEmptyGroups = nonEmptyBinIndices.map(i => groups[i]);

      // Add new grouped column to newData
      const newData = {
        bins: nonEmptyRanges,
        $grouped: nonEmptyGroups.map(group => new DataContainer(group, { validate: false }))
      };

      return newData
    }

    function getBinIndex (bins, value) {
      // Find index of bin in which the instance belongs
      const binIndex = bins.findIndex(function (bin, i) {
        if (i === bins.length - 1) {
          return value >= bin[0] && value <= bin[1]
        } else {
          return value >= bin[0] && value < bin[1]
        }
      });

      return binIndex
    }

    function getNonEmptyBinIndices (groups) {
      const nonEmptyBinIndices = [];

      for (let i = 0; i < groups.length; i++) {
        if (getDataLength(groups[i]) > 0) nonEmptyBinIndices.push(i);
      }

      return nonEmptyBinIndices
    }

    function binKd (data, variables, rangesPerVariable) {
      const binIndexTree = constructBinIndexTree(data, variables, rangesPerVariable);
      const binnedData = convertTreeIntoColumnData(binIndexTree, variables, rangesPerVariable);

      binnedData.$grouped = binnedData.$grouped.map(group => new DataContainer(group, { validate: false }));

      return binnedData
    }

    function constructBinIndexTree (data, variables, rangesPerVariable) {
      let binIndexTree = {};
      const dataLength = getDataLength(data);

      for (let i = 0; i < dataLength; i++) {
        const binIndices = getBinIndices(data, i, variables, rangesPerVariable);
        if (rowIsNotEmpty(binIndices)) {
          binIndexTree = updateBranch(binIndexTree, binIndices, data, i);
        }
      }

      return binIndexTree
    }

    function getBinIndices (data, index, variables, rangesPerVariable) {
      const binIndices = [];

      for (let i = 0; i < variables.length; i++) {
        const variable = variables[i];
        const value = data[variable][index];

        binIndices.push(getBinIndex(rangesPerVariable[i], value));
      }

      return binIndices
    }

    function rowIsNotEmpty (binIndices) {
      return binIndices.every(binIndex => binIndex > -1)
    }

    function updateBranch (tree, indices, data, rowIndex) {
      let currentLevel = tree;

      for (let i = 0; i < indices.length; i++) {
        const index = indices[i];

        if (lastIndex(i, indices.length)) {
          if (!(index in currentLevel)) {
            currentLevel[index] = initGroup(data);
          }

          currentLevel[index] = addRow(currentLevel[index], data, rowIndex);
        } else {
          if (!(index in currentLevel)) {
            currentLevel[index] = {};
          }

          currentLevel = currentLevel[index];
        }
      }

      return tree
    }

    function lastIndex (i, length) {
      return i === (length - 1)
    }

    function initGroup (data) {
      const group = {};
      for (const columnName in data) {
        group[columnName] = [];
      }

      return group
    }

    function addRow (group, data, rowIndex) {
      for (const columnName in data) {
        group[columnName].push(data[columnName][rowIndex]);
      }

      return group
    }

    function convertTreeIntoColumnData (binIndexTree, variables, binsPerVariable) {
      const columnData = initColumnData$1(variables);
      const dataIndex = variables.length;

      forEachBranch(binIndexTree, branchArray => {
        for (let i = 0; i < variables.length; i++) {
          const binIndex = branchArray[i];
          const bin = binsPerVariable[i][binIndex];

          const binnedColumnName = getBinnedColumnName(variables[i]);

          columnData[binnedColumnName].push(bin);
        }

        columnData.$grouped.push(branchArray[dataIndex]);
      });

      return columnData
    }

    function initColumnData$1 (variables) {
      const columnData = { $grouped: [] };

      for (let i = 0; i < variables.length; i++) {
        const binnedColumnName = getBinnedColumnName(variables[i]);
        columnData[binnedColumnName] = [];
      }

      return columnData
    }

    function forEachBranch (tree, callback) {
      for (const path of traverse(tree)) {
        callback(path);
      }
    }

    // https://stackoverflow.com/a/45628445
    function * traverse (o) {
      const memory = new Set();

      function * innerTraversal (o, path = []) {
        if (memory.has(o)) {
          // we've seen this object before don't iterate it
          return
        }

        // add the new object to our memory.
        memory.add(o);

        for (const i of Object.keys(o)) {
          const itemPath = path.concat(i);

          if (!('$key' in o[i])) {
            yield * innerTraversal(o[i], itemPath);
          } else {
            itemPath.push(o[i]);
            yield itemPath;
          }
        }
      }

      yield * innerTraversal(o);
    }

    function getBinnedColumnName (columnName) {
      return 'bins_' + columnName
    }

    function dropNA (data, dropInstructions) {
      let filterFunc;

      if (!dropInstructions) {
        // If the instructions are falsy, we will check all columns for invalid values
        filterFunc = row => {
          let keep = true;

          for (const key in row) {
            const val = row[key];
            if (isInvalid(val)) {
              keep = false;
              break
            }
          }

          return keep
        };
      } else if (dropInstructions.constructor === String) {
        // If the instructions are a string, we check only one column for invalid values
        checkIfColumnsExist(data, [dropInstructions]);
        filterFunc = row => !isInvalid(row[dropInstructions]);
      } else if (dropInstructions.constructor === Array) {
        // if the instructions are an array, we check the columns named in the array
        checkIfColumnsExist(data, dropInstructions);
        filterFunc = row => {
          let keep = true;
          for (const col of dropInstructions) {
            if (isInvalid(row[col])) {
              keep = false;
              break
            }
          }

          return keep
        };
      } else {
        throw new Error('dropNA can only be passed undefined, a String or an Array of Strings')
      }

      return filter(data, filterFunc)
    }

    function checkIfColumnsExist (data, columns) {
      for (const col of columns) {
        if (!(col in data)) {
          throw new Error(`Column '${col}' not found`)
        }
      }
    }

    function transformGeometries (geometries, transformFunc) {
      const geometriesClone = JSON.parse(JSON.stringify(geometries));

      if (geometriesClone.constructor === Array) {
        for (let i = 0; i < geometriesClone.length; i++) {
          transformGeometryInplace(geometriesClone[i], transformFunc);
        }
      }

      if (geometriesClone.constructor === Object) {
        for (const key in geometriesClone) {
          transformGeometryInplace(geometriesClone[key], transformFunc);
        }
      }

      return geometriesClone
    }

    function transformGeometryInplace (geometry, transformFunc) {
      coordEach(geometry, coord => {
        const transformedPosition = transformFunc(coord);
        coord[0] = transformedPosition[0];
        coord[1] = transformedPosition[1];
      });
    }

    function reproject (data, transformation) {
      if (!('$geometry' in data)) {
        warn('No geometry column found. Skipping reproject-transformation.');
        return data
      }

      const transformedGeometries = transformGeometries(data.$geometry, transformation);

      const newData = Object.assign({}, data);
      newData.$geometry = transformedGeometries;

      return newData
    }

    function transform (data, transformFunction) {
      if (transformFunction.constructor !== Function) {
        throw new Error('Invalid \'transform\' transformation: must be a Function')
      }

      return transformFunction(data)
    }

    function cumsum (data, cumsumInstructions, options = { asInterval: false }) {
      const asInterval = options.asInterval;
      const length = getDataLength(data);
      const newColumns = {};

      for (const newColName in cumsumInstructions) {
        checkRegularColumnName(newColName);

        const oldColName = cumsumInstructions[newColName];

        if (getColumnType(data[oldColName]) !== 'quantitative') {
          throw new Error('cumsum columns can only be of type \'quantitative\'')
        }

        let previousSum = 0;
        let currentSum = 0;
        newColumns[newColName] = [];

        for (let i = 0; i < length; i++) {
          const value = data[oldColName][i];

          if (!isInvalid(value)) {
            currentSum += value;
          }

          if (asInterval) {
            newColumns[newColName].push([previousSum, currentSum]);
          } else {
            newColumns[newColName].push(currentSum);
          }

          previousSum = currentSum;
        }
      }

      let newData = Object.assign({}, data);
      newData = Object.assign(newData, newColumns);

      return newData
    }

    function rowCumsum (data, _cumsumInstructions, options = { asInterval: false }) {
      const asInterval = options.asInterval;
      const cumsumInstructions = parseCumsumInstructions(_cumsumInstructions);
      validateColumns(data, cumsumInstructions);

      const rowCumsumColumns = {};
      let previousColumnName;

      for (const [newName, oldName] of cumsumInstructions) {
        checkRegularColumnName(newName);
        const oldColumn = data[oldName];

        if (previousColumnName === undefined) {
          if (asInterval) {
            rowCumsumColumns[newName] = oldColumn.map(value => [0, value]);
          } else {
            rowCumsumColumns[newName] = oldColumn;
          }
        } else {
          const previousColumn = rowCumsumColumns[previousColumnName];
          let newColumn;

          if (asInterval) {
            newColumn = oldColumn.map((value, i) => {
              const previousValue = previousColumn[i][1];
              const newValue = previousValue + value;
              return [previousValue, newValue]
            });
          } else {
            newColumn = oldColumn.map((value, i) => value + previousColumn[i]);
          }

          rowCumsumColumns[newName] = newColumn;
        }

        previousColumnName = newName;
      }

      let newData = Object.assign({}, data);
      newData = Object.assign(newData, rowCumsumColumns);

      return newData
    }

    const invalidInstructionsError = new Error('Invalid rowCumsum instrutions');

    function parseCumsumInstructions (cumsumInstructions) {
      if (cumsumInstructions && cumsumInstructions.constructor === Array) {
        const parsedInstructions = [];

        for (const instruction of cumsumInstructions) {
          validateInstruction(instruction);

          if (instruction.constructor === String) {
            parsedInstructions.push([instruction, instruction]);
          }

          if (instruction.constructor === Object) {
            const newName = Object.keys(instruction)[0];
            const oldName = instruction[newName];
            parsedInstructions.push([newName, oldName]);
          }
        }

        return parsedInstructions
      }

      throw invalidInstructionsError
    }

    function validateInstruction (instruction) {
      if (instruction.constructor === String) return

      if (instruction.constructor === Object) {
        if (Object.keys(instruction).length === 1) return
      }

      throw invalidInstructionsError
    }

    function validateColumns (data, stackInstructions) {
      for (const [, oldName] of stackInstructions) {
        const column = data[oldName];

        if (!column) {
          throw new Error(`Column '${oldName}' does not exist`)
        }

        const columnType = getColumnType(column);

        if (columnType !== 'quantitative') {
          throw new Error('rowCumsum columns can only be of type \'quantitative\'')
        }
      }
    }

    function _isPlaceholder(a) {
      return a != null && typeof a === 'object' && a['@@functional/placeholder'] === true;
    }

    /**
     * Optimized internal one-arity curry function.
     *
     * @private
     * @category Function
     * @param {Function} fn The function to curry.
     * @return {Function} The curried function.
     */

    function _curry1(fn) {
      return function f1(a) {
        if (arguments.length === 0 || _isPlaceholder(a)) {
          return f1;
        } else {
          return fn.apply(this, arguments);
        }
      };
    }

    /**
     * Optimized internal two-arity curry function.
     *
     * @private
     * @category Function
     * @param {Function} fn The function to curry.
     * @return {Function} The curried function.
     */

    function _curry2(fn) {
      return function f2(a, b) {
        switch (arguments.length) {
          case 0:
            return f2;

          case 1:
            return _isPlaceholder(a) ? f2 : _curry1(function (_b) {
              return fn(a, _b);
            });

          default:
            return _isPlaceholder(a) && _isPlaceholder(b) ? f2 : _isPlaceholder(a) ? _curry1(function (_a) {
              return fn(_a, b);
            }) : _isPlaceholder(b) ? _curry1(function (_b) {
              return fn(a, _b);
            }) : fn(a, b);
        }
      };
    }

    function _arity(n, fn) {
      /* eslint-disable no-unused-vars */
      switch (n) {
        case 0:
          return function () {
            return fn.apply(this, arguments);
          };

        case 1:
          return function (a0) {
            return fn.apply(this, arguments);
          };

        case 2:
          return function (a0, a1) {
            return fn.apply(this, arguments);
          };

        case 3:
          return function (a0, a1, a2) {
            return fn.apply(this, arguments);
          };

        case 4:
          return function (a0, a1, a2, a3) {
            return fn.apply(this, arguments);
          };

        case 5:
          return function (a0, a1, a2, a3, a4) {
            return fn.apply(this, arguments);
          };

        case 6:
          return function (a0, a1, a2, a3, a4, a5) {
            return fn.apply(this, arguments);
          };

        case 7:
          return function (a0, a1, a2, a3, a4, a5, a6) {
            return fn.apply(this, arguments);
          };

        case 8:
          return function (a0, a1, a2, a3, a4, a5, a6, a7) {
            return fn.apply(this, arguments);
          };

        case 9:
          return function (a0, a1, a2, a3, a4, a5, a6, a7, a8) {
            return fn.apply(this, arguments);
          };

        case 10:
          return function (a0, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
            return fn.apply(this, arguments);
          };

        default:
          throw new Error('First argument to _arity must be a non-negative integer no greater than ten');
      }
    }

    /**
     * Internal curryN function.
     *
     * @private
     * @category Function
     * @param {Number} length The arity of the curried function.
     * @param {Array} received An array of arguments received thus far.
     * @param {Function} fn The function to curry.
     * @return {Function} The curried function.
     */

    function _curryN(length, received, fn) {
      return function () {
        var combined = [];
        var argsIdx = 0;
        var left = length;
        var combinedIdx = 0;

        while (combinedIdx < received.length || argsIdx < arguments.length) {
          var result;

          if (combinedIdx < received.length && (!_isPlaceholder(received[combinedIdx]) || argsIdx >= arguments.length)) {
            result = received[combinedIdx];
          } else {
            result = arguments[argsIdx];
            argsIdx += 1;
          }

          combined[combinedIdx] = result;

          if (!_isPlaceholder(result)) {
            left -= 1;
          }

          combinedIdx += 1;
        }

        return left <= 0 ? fn.apply(this, combined) : _arity(left, _curryN(length, combined, fn));
      };
    }

    /**
     * Returns a curried equivalent of the provided function, with the specified
     * arity. The curried function has two unusual capabilities. First, its
     * arguments needn't be provided one at a time. If `g` is `R.curryN(3, f)`, the
     * following are equivalent:
     *
     *   - `g(1)(2)(3)`
     *   - `g(1)(2, 3)`
     *   - `g(1, 2)(3)`
     *   - `g(1, 2, 3)`
     *
     * Secondly, the special placeholder value [`R.__`](#__) may be used to specify
     * "gaps", allowing partial application of any combination of arguments,
     * regardless of their positions. If `g` is as above and `_` is [`R.__`](#__),
     * the following are equivalent:
     *
     *   - `g(1, 2, 3)`
     *   - `g(_, 2, 3)(1)`
     *   - `g(_, _, 3)(1)(2)`
     *   - `g(_, _, 3)(1, 2)`
     *   - `g(_, 2)(1)(3)`
     *   - `g(_, 2)(1, 3)`
     *   - `g(_, 2)(_, 3)(1)`
     *
     * @func
     * @memberOf R
     * @since v0.5.0
     * @category Function
     * @sig Number -> (* -> a) -> (* -> a)
     * @param {Number} length The arity for the returned function.
     * @param {Function} fn The function to curry.
     * @return {Function} A new, curried function.
     * @see R.curry
     * @example
     *
     *      const sumArgs = (...args) => R.sum(args);
     *
     *      const curriedAddFourNumbers = R.curryN(4, sumArgs);
     *      const f = curriedAddFourNumbers(1, 2);
     *      const g = f(3);
     *      g(4); //=> 10
     */

    var curryN =
    /*#__PURE__*/
    _curry2(function curryN(length, fn) {
      if (length === 1) {
        return _curry1(fn);
      }

      return _arity(length, _curryN(length, [], fn));
    });

    /**
     * Optimized internal three-arity curry function.
     *
     * @private
     * @category Function
     * @param {Function} fn The function to curry.
     * @return {Function} The curried function.
     */

    function _curry3(fn) {
      return function f3(a, b, c) {
        switch (arguments.length) {
          case 0:
            return f3;

          case 1:
            return _isPlaceholder(a) ? f3 : _curry2(function (_b, _c) {
              return fn(a, _b, _c);
            });

          case 2:
            return _isPlaceholder(a) && _isPlaceholder(b) ? f3 : _isPlaceholder(a) ? _curry2(function (_a, _c) {
              return fn(_a, b, _c);
            }) : _isPlaceholder(b) ? _curry2(function (_b, _c) {
              return fn(a, _b, _c);
            }) : _curry1(function (_c) {
              return fn(a, b, _c);
            });

          default:
            return _isPlaceholder(a) && _isPlaceholder(b) && _isPlaceholder(c) ? f3 : _isPlaceholder(a) && _isPlaceholder(b) ? _curry2(function (_a, _b) {
              return fn(_a, _b, c);
            }) : _isPlaceholder(a) && _isPlaceholder(c) ? _curry2(function (_a, _c) {
              return fn(_a, b, _c);
            }) : _isPlaceholder(b) && _isPlaceholder(c) ? _curry2(function (_b, _c) {
              return fn(a, _b, _c);
            }) : _isPlaceholder(a) ? _curry1(function (_a) {
              return fn(_a, b, c);
            }) : _isPlaceholder(b) ? _curry1(function (_b) {
              return fn(a, _b, c);
            }) : _isPlaceholder(c) ? _curry1(function (_c) {
              return fn(a, b, _c);
            }) : fn(a, b, c);
        }
      };
    }

    /**
     * Tests whether or not an object is an array.
     *
     * @private
     * @param {*} val The object to test.
     * @return {Boolean} `true` if `val` is an array, `false` otherwise.
     * @example
     *
     *      _isArray([]); //=> true
     *      _isArray(null); //=> false
     *      _isArray({}); //=> false
     */
    var _isArray = Array.isArray || function _isArray(val) {
      return val != null && val.length >= 0 && Object.prototype.toString.call(val) === '[object Array]';
    };

    function _isTransformer(obj) {
      return obj != null && typeof obj['@@transducer/step'] === 'function';
    }

    function _isString(x) {
      return Object.prototype.toString.call(x) === '[object String]';
    }

    /**
     * Tests whether or not an object is similar to an array.
     *
     * @private
     * @category Type
     * @category List
     * @sig * -> Boolean
     * @param {*} x The object to test.
     * @return {Boolean} `true` if `x` has a numeric length property and extreme indices defined; `false` otherwise.
     * @example
     *
     *      _isArrayLike([]); //=> true
     *      _isArrayLike(true); //=> false
     *      _isArrayLike({}); //=> false
     *      _isArrayLike({length: 10}); //=> false
     *      _isArrayLike({0: 'zero', 9: 'nine', length: 10}); //=> true
     */

    var _isArrayLike =
    /*#__PURE__*/
    _curry1(function isArrayLike(x) {
      if (_isArray(x)) {
        return true;
      }

      if (!x) {
        return false;
      }

      if (typeof x !== 'object') {
        return false;
      }

      if (_isString(x)) {
        return false;
      }

      if (x.nodeType === 1) {
        return !!x.length;
      }

      if (x.length === 0) {
        return true;
      }

      if (x.length > 0) {
        return x.hasOwnProperty(0) && x.hasOwnProperty(x.length - 1);
      }

      return false;
    });

    var XWrap =
    /*#__PURE__*/
    function () {
      function XWrap(fn) {
        this.f = fn;
      }

      XWrap.prototype['@@transducer/init'] = function () {
        throw new Error('init not implemented on XWrap');
      };

      XWrap.prototype['@@transducer/result'] = function (acc) {
        return acc;
      };

      XWrap.prototype['@@transducer/step'] = function (acc, x) {
        return this.f(acc, x);
      };

      return XWrap;
    }();

    function _xwrap(fn) {
      return new XWrap(fn);
    }

    /**
     * Creates a function that is bound to a context.
     * Note: `R.bind` does not provide the additional argument-binding capabilities of
     * [Function.prototype.bind](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind).
     *
     * @func
     * @memberOf R
     * @since v0.6.0
     * @category Function
     * @category Object
     * @sig (* -> *) -> {*} -> (* -> *)
     * @param {Function} fn The function to bind to context
     * @param {Object} thisObj The context to bind `fn` to
     * @return {Function} A function that will execute in the context of `thisObj`.
     * @see R.partial
     * @example
     *
     *      const log = R.bind(console.log, console);
     *      R.pipe(R.assoc('a', 2), R.tap(log), R.assoc('a', 3))({a: 1}); //=> {a: 3}
     *      // logs {a: 2}
     * @symb R.bind(f, o)(a, b) = f.call(o, a, b)
     */

    var bind =
    /*#__PURE__*/
    _curry2(function bind(fn, thisObj) {
      return _arity(fn.length, function () {
        return fn.apply(thisObj, arguments);
      });
    });

    function _arrayReduce(xf, acc, list) {
      var idx = 0;
      var len = list.length;

      while (idx < len) {
        acc = xf['@@transducer/step'](acc, list[idx]);

        if (acc && acc['@@transducer/reduced']) {
          acc = acc['@@transducer/value'];
          break;
        }

        idx += 1;
      }

      return xf['@@transducer/result'](acc);
    }

    function _iterableReduce(xf, acc, iter) {
      var step = iter.next();

      while (!step.done) {
        acc = xf['@@transducer/step'](acc, step.value);

        if (acc && acc['@@transducer/reduced']) {
          acc = acc['@@transducer/value'];
          break;
        }

        step = iter.next();
      }

      return xf['@@transducer/result'](acc);
    }

    function _methodReduce(xf, acc, obj, methodName) {
      return xf['@@transducer/result'](obj[methodName](bind(xf['@@transducer/step'], xf), acc));
    }

    var symIterator = typeof Symbol !== 'undefined' ? Symbol.iterator : '@@iterator';
    function _reduce(fn, acc, list) {
      if (typeof fn === 'function') {
        fn = _xwrap(fn);
      }

      if (_isArrayLike(list)) {
        return _arrayReduce(fn, acc, list);
      }

      if (typeof list['fantasy-land/reduce'] === 'function') {
        return _methodReduce(fn, acc, list, 'fantasy-land/reduce');
      }

      if (list[symIterator] != null) {
        return _iterableReduce(fn, acc, list[symIterator]());
      }

      if (typeof list.next === 'function') {
        return _iterableReduce(fn, acc, list);
      }

      if (typeof list.reduce === 'function') {
        return _methodReduce(fn, acc, list, 'reduce');
      }

      throw new TypeError('reduce: list must be array or iterable');
    }

    function _has(prop, obj) {
      return Object.prototype.hasOwnProperty.call(obj, prop);
    }

    /**
     * Returns a single item by iterating through the list, successively calling
     * the iterator function and passing it an accumulator value and the current
     * value from the array, and then passing the result to the next call.
     *
     * The iterator function receives two values: *(acc, value)*. It may use
     * [`R.reduced`](#reduced) to shortcut the iteration.
     *
     * The arguments' order of [`reduceRight`](#reduceRight)'s iterator function
     * is *(value, acc)*.
     *
     * Note: `R.reduce` does not skip deleted or unassigned indices (sparse
     * arrays), unlike the native `Array.prototype.reduce` method. For more details
     * on this behavior, see:
     * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce#Description
     *
     * Dispatches to the `reduce` method of the third argument, if present. When
     * doing so, it is up to the user to handle the [`R.reduced`](#reduced)
     * shortcuting, as this is not implemented by `reduce`.
     *
     * @func
     * @memberOf R
     * @since v0.1.0
     * @category List
     * @sig ((a, b) -> a) -> a -> [b] -> a
     * @param {Function} fn The iterator function. Receives two values, the accumulator and the
     *        current element from the array.
     * @param {*} acc The accumulator value.
     * @param {Array} list The list to iterate over.
     * @return {*} The final, accumulated value.
     * @see R.reduced, R.addIndex, R.reduceRight
     * @example
     *
     *      R.reduce(R.subtract, 0, [1, 2, 3, 4]) // => ((((0 - 1) - 2) - 3) - 4) = -10
     *      //          -               -10
     *      //         / \              / \
     *      //        -   4           -6   4
     *      //       / \              / \
     *      //      -   3   ==>     -3   3
     *      //     / \              / \
     *      //    -   2           -1   2
     *      //   / \              / \
     *      //  0   1            0   1
     *
     * @symb R.reduce(f, a, [b, c, d]) = f(f(f(a, b), c), d)
     */

    var reduce =
    /*#__PURE__*/
    _curry3(_reduce);

    function _cloneRegExp(pattern) {
      return new RegExp(pattern.source, (pattern.global ? 'g' : '') + (pattern.ignoreCase ? 'i' : '') + (pattern.multiline ? 'm' : '') + (pattern.sticky ? 'y' : '') + (pattern.unicode ? 'u' : ''));
    }

    /**
     * Gives a single-word string description of the (native) type of a value,
     * returning such answers as 'Object', 'Number', 'Array', or 'Null'. Does not
     * attempt to distinguish user Object types any further, reporting them all as
     * 'Object'.
     *
     * @func
     * @memberOf R
     * @since v0.8.0
     * @category Type
     * @sig (* -> {*}) -> String
     * @param {*} val The value to test
     * @return {String}
     * @example
     *
     *      R.type({}); //=> "Object"
     *      R.type(1); //=> "Number"
     *      R.type(false); //=> "Boolean"
     *      R.type('s'); //=> "String"
     *      R.type(null); //=> "Null"
     *      R.type([]); //=> "Array"
     *      R.type(/[A-z]/); //=> "RegExp"
     *      R.type(() => {}); //=> "Function"
     *      R.type(undefined); //=> "Undefined"
     */

    var type =
    /*#__PURE__*/
    _curry1(function type(val) {
      return val === null ? 'Null' : val === undefined ? 'Undefined' : Object.prototype.toString.call(val).slice(8, -1);
    });

    /**
     * Copies an object.
     *
     * @private
     * @param {*} value The value to be copied
     * @param {Array} refFrom Array containing the source references
     * @param {Array} refTo Array containing the copied source references
     * @param {Boolean} deep Whether or not to perform deep cloning.
     * @return {*} The copied value.
     */

    function _clone(value, refFrom, refTo, deep) {
      var copy = function copy(copiedValue) {
        var len = refFrom.length;
        var idx = 0;

        while (idx < len) {
          if (value === refFrom[idx]) {
            return refTo[idx];
          }

          idx += 1;
        }

        refFrom[idx + 1] = value;
        refTo[idx + 1] = copiedValue;

        for (var key in value) {
          copiedValue[key] = deep ? _clone(value[key], refFrom, refTo, true) : value[key];
        }

        return copiedValue;
      };

      switch (type(value)) {
        case 'Object':
          return copy({});

        case 'Array':
          return copy([]);

        case 'Date':
          return new Date(value.valueOf());

        case 'RegExp':
          return _cloneRegExp(value);

        default:
          return value;
      }
    }

    function _identity(x) {
      return x;
    }

    /**
     * A function that does nothing but return the parameter supplied to it. Good
     * as a default or placeholder function.
     *
     * @func
     * @memberOf R
     * @since v0.1.0
     * @category Function
     * @sig a -> a
     * @param {*} x The value to return.
     * @return {*} The input value, `x`.
     * @example
     *
     *      R.identity(1); //=> 1
     *
     *      const obj = {};
     *      R.identity(obj) === obj; //=> true
     * @symb R.identity(a) = a
     */

    var identity =
    /*#__PURE__*/
    _curry1(_identity);

    function _objectAssign(target) {
      if (target == null) {
        throw new TypeError('Cannot convert undefined or null to object');
      }

      var output = Object(target);
      var idx = 1;
      var length = arguments.length;

      while (idx < length) {
        var source = arguments[idx];

        if (source != null) {
          for (var nextKey in source) {
            if (_has(nextKey, source)) {
              output[nextKey] = source[nextKey];
            }
          }
        }

        idx += 1;
      }

      return output;
    }

    var _objectAssign$1 = typeof Object.assign === 'function' ? Object.assign : _objectAssign;

    /**
     * Creates an object containing a single key:value pair.
     *
     * @func
     * @memberOf R
     * @since v0.18.0
     * @category Object
     * @sig String -> a -> {String:a}
     * @param {String} key
     * @param {*} val
     * @return {Object}
     * @see R.pair
     * @example
     *
     *      const matchPhrases = R.compose(
     *        R.objOf('must'),
     *        R.map(R.objOf('match_phrase'))
     *      );
     *      matchPhrases(['foo', 'bar', 'baz']); //=> {must: [{match_phrase: 'foo'}, {match_phrase: 'bar'}, {match_phrase: 'baz'}]}
     */

    var objOf =
    /*#__PURE__*/
    _curry2(function objOf(key, val) {
      var obj = {};
      obj[key] = val;
      return obj;
    });

    var _stepCatArray = {
      '@@transducer/init': Array,
      '@@transducer/step': function (xs, x) {
        xs.push(x);
        return xs;
      },
      '@@transducer/result': _identity
    };
    var _stepCatString = {
      '@@transducer/init': String,
      '@@transducer/step': function (a, b) {
        return a + b;
      },
      '@@transducer/result': _identity
    };
    var _stepCatObject = {
      '@@transducer/init': Object,
      '@@transducer/step': function (result, input) {
        return _objectAssign$1(result, _isArrayLike(input) ? objOf(input[0], input[1]) : input);
      },
      '@@transducer/result': _identity
    };
    function _stepCat(obj) {
      if (_isTransformer(obj)) {
        return obj;
      }

      if (_isArrayLike(obj)) {
        return _stepCatArray;
      }

      if (typeof obj === 'string') {
        return _stepCatString;
      }

      if (typeof obj === 'object') {
        return _stepCatObject;
      }

      throw new Error('Cannot create transformer for ' + obj);
    }

    /**
     * Transforms the items of the list with the transducer and appends the
     * transformed items to the accumulator using an appropriate iterator function
     * based on the accumulator type.
     *
     * The accumulator can be an array, string, object or a transformer. Iterated
     * items will be appended to arrays and concatenated to strings. Objects will
     * be merged directly or 2-item arrays will be merged as key, value pairs.
     *
     * The accumulator can also be a transformer object that provides a 2-arity
     * reducing iterator function, step, 0-arity initial value function, init, and
     * 1-arity result extraction function result. The step function is used as the
     * iterator function in reduce. The result function is used to convert the
     * final accumulator into the return type and in most cases is R.identity. The
     * init function is used to provide the initial accumulator.
     *
     * The iteration is performed with [`R.reduce`](#reduce) after initializing the
     * transducer.
     *
     * @func
     * @memberOf R
     * @since v0.12.0
     * @category List
     * @sig a -> (b -> b) -> [c] -> a
     * @param {*} acc The initial accumulator value.
     * @param {Function} xf The transducer function. Receives a transformer and returns a transformer.
     * @param {Array} list The list to iterate over.
     * @return {*} The final, accumulated value.
     * @see R.transduce
     * @example
     *
     *      const numbers = [1, 2, 3, 4];
     *      const transducer = R.compose(R.map(R.add(1)), R.take(2));
     *
     *      R.into([], transducer, numbers); //=> [2, 3]
     *
     *      const intoArray = R.into([]);
     *      intoArray(transducer, numbers); //=> [2, 3]
     */

    var into =
    /*#__PURE__*/
    _curry3(function into(acc, xf, list) {
      return _isTransformer(acc) ? _reduce(xf(acc), acc['@@transducer/init'](), list) : _reduce(xf(_stepCat(acc)), _clone(acc, [], [], false), list);
    });

    function wrap (data) {
      const length = _getLength(data);

      return {
        reduce: function (step, acc) {
          let idx = 0;

          while (idx < length) {
            const row = {};

            for (const columnName in data) {
              row[columnName] = data[columnName][idx];
            }

            acc = step(acc, row);

            if (acc && acc['@@transducer/reduced']) {
              acc = acc['@@transducer/value'];
              break
            }

            idx += 1;
          }

          return acc
        }
      }
    }

    function accumulator () {
      return new ColumnOrientedAccumulator()
    }

    function _getLength (data) {
      return data[Object.keys(data)[0]].length
    }

    function ColumnOrientedAccumulator () {
      this.init = true;
    }

    ColumnOrientedAccumulator.prototype['@@transducer/init'] = () => ({});
    ColumnOrientedAccumulator.prototype['@@transducer/result'] = identity;
    ColumnOrientedAccumulator.prototype['@@transducer/step'] = function (acc, row) {
      if (this.init) {
        this.init = false;
        return this._initStep(acc, row)
      }

      return this._step(acc, row)
    };
    ColumnOrientedAccumulator.prototype._initStep = _initStep;
    ColumnOrientedAccumulator.prototype._step = _step;

    function _initStep (acc, row) {
      for (const columnName in row) {
        acc[columnName] = [row[columnName]];
      }

      return acc
    }

    function _step (acc, row) {
      for (const columnName in row) {
        acc[columnName].push(row[columnName]);
      }

      return acc
    }

    var columnOriented = /*#__PURE__*/Object.freeze({
      __proto__: null,
      wrap: wrap,
      accumulator: accumulator
    });

    const REDUCABLE = Symbol('Reducable');

    // Adapted from ramda: https://github.com/ramda/ramda
    var _isArray$1 = Array.isArray || function _isArray (val) {
      return (val != null &&
              val.length >= 0 &&
              Object.prototype.toString.call(val) === '[object Array]')
    };

    function _isString$1 (x) {
      return Object.prototype.toString.call(x) === '[object String]'
    }

    // Adapted from ramda: https://github.com/ramda/ramda

    const _isArrayLike$1 = curryN(1, function isArrayLike (x) {
      if (_isArray$1(x)) { return true }
      if (!x) { return false }
      if (typeof x !== 'object') { return false }
      if (_isString$1(x)) { return false }
      if (x.length === 0) { return true }
      if (x.length > 0) {
        return 0 in x && (x.length - 1) in x
      }
      return false
    });

    function _isTransformer$1 (obj) {
      return obj != null && typeof obj['@@transducer/step'] === 'function'
    }

    // Adapted from ramda: https://github.com/ramda/ramda

    function _dispatchable (methodNames, transducerCreator, fn) {
      return function () {
        if (arguments.length === 0) {
          return fn()
        }
        const obj = arguments[arguments.length - 1];

        if (!_isArray$1(obj)) {
          let idx = 0;
          while (idx < methodNames.length) {
            if (typeof obj[methodNames[idx]] === 'function') {
              return obj[methodNames[idx]].apply(obj, Array.prototype.slice.call(arguments, 0, -1))
            }
            idx += 1;
          }
          if (_isTransformer$1(obj)) {
            var transducer = transducerCreator.apply(null, Array.prototype.slice.call(arguments, 0, -1));
            return transducer(obj)
          }
        }
        return fn.apply(this, arguments)
      }
    }

    var _xfBase = {
      init: function () {
        return this.xf['@@transducer/init']()
      },
      result: function (result) {
        return this.xf['@@transducer/result'](result)
      }
    };

    const _xarrange = curryN(2, function _xarrange (arrangeInstructions, xf) {
      return new XArrange(arrangeInstructions, xf)
    });

    const arrange$1 = curryN(2, _dispatchable([], _xarrange,
      function (arrangeInstructions, df) {
        return into(
          [],
          arrange$1(arrangeInstructions),
          df
        )
      }
    ));

    function XArrange (arrangeInstructions, xf) {
      this.arrangeFn = arrangeInstructions.constructor === Function
        ? arrangeInstructions
        : _combineArrangeFns(arrangeInstructions);

      this.rows = [];
      this.xf = xf;
    }

    XArrange.prototype['@@transducer/init'] = _xfBase.init;
    XArrange.prototype['@@transducer/result'] = function () {
      this.rows.sort(this.arrangeFn);

      return this.xf['@@transducer/result'](reduce(
        this.xf['@@transducer/step'].bind(this.xf),
        this.xf['@@transducer/init'](),
        this.rows
      ))
    };
    XArrange.prototype['@@transducer/step'] = function (acc, row) {
      this.rows.push(row);
    };

    function _combineArrangeFns (arrangeFns) {
      return function (a, b) {
        for (let i = 0; i < arrangeFns.length; i++) {
          const res = arrangeFns[i](a, b);
          if (res) return res
        }

        return -1
      }
    }

    function _reduceObjVals (step, acc, obj) {
      for (const key in obj) {
        const val = obj[key];

        acc = step(acc, val);

        if (acc && acc['@@transducer/reduced']) {
          acc = acc['@@transducer/value'];
          break
        }
      }

      return acc
    }

    function _idFromCols (row, idCols, sep = '@') {
      let id = sep;

      for (let i = 0; i < idCols.length; i++) {
        id += row[idCols[i]] + sep;
      }

      return id
    }

    const _xsummariseByReducable = (summariseFn, by, xf) => {
      return new XSummariseByReducable(summariseFn, by, xf)
    };

    function XSummariseByReducable (summariseFn, by, xf) {
      this.instructions = _getReducableInstructions(summariseFn);
      this.by = by;
      this.xf = xf;

      this.summarizedDataById = {};
    }

    function _getReducableInstructions (f) {
      const columnProxy = new Proxy({}, { get (_, prop) { return prop } });
      return f(columnProxy)
    }

    XSummariseByReducable.prototype['@@transducer/init'] = _xfBase.init;
    XSummariseByReducable.prototype['@@transducer/result'] = _result;
    XSummariseByReducable.prototype['@@transducer/step'] = _step$2;
    XSummariseByReducable.prototype._finalStep = _finalStep;

    function _result () {
      return this.xf['@@transducer/result'](_reduceObjVals(
        this._finalStep.bind(this),
        this.xf['@@transducer/init'](),
        this.summarizedDataById
      ))
    }

    function _step$2 (acc, row) {
      const id = _idFromCols(row, this.by);
      const newId = !(id in this.summarizedDataById);

      if (newId) {
        this.summarizedDataById[id] = _initSummaryGroup(
          this.instructions,
          row,
          this.by
        );
      }

      this.summarizedDataById[id] = _updateSummaryGroup(
        this.summarizedDataById[id],
        this.instructions,
        row
      );

      return acc
    }

    function _finalStep (acc, row) {
      for (const newColumnName in this.instructions) {
        row[newColumnName] = this
          .instructions[newColumnName]
          .xf['@@transducer/result'](row[newColumnName]);
      }

      return this.xf['@@transducer/step'](acc, row)
    }

    function _initSummaryGroup (instructions, row, by) {
      const summaryGroup = {};

      for (const newColumnName in instructions) {
        const instruction = instructions[newColumnName];
        summaryGroup[newColumnName] = instruction.xf['@@transducer/init']();
      }

      for (let i = 0; i < by.length; i++) {
        const byCol = by[i];
        summaryGroup[byCol] = row[byCol];
      }

      return summaryGroup
    }

    function _updateSummaryGroup (summaryGroup, instructions, row) {
      for (const newColumnName in instructions) {
        const instruction = instructions[newColumnName];

        summaryGroup[newColumnName] = instruction.xf['@@transducer/step'](
          summaryGroup[newColumnName],
          row[instruction.column]
        );
      }

      return summaryGroup
    }

    const _stepCatArray$1 = {
      '@@transducer/init': Array,
      '@@transducer/step': function (xs, x) {
        xs.push(x);
        return xs
      },
      '@@transducer/result': identity
    };

    const _stepCatString$1 = {
      '@@transducer/init': String,
      '@@transducer/step': function (a, b) { return a + b },
      '@@transducer/result': identity
    };

    const _stepCatObject$1 = {
      '@@transducer/init': Object,
      '@@transducer/step': function (result, input) {
        return Object.assign(
          result,
          _isArrayLike$1(input) ? objOf(input[0], input[1]) : input
        )
      },
      '@@transducer/result': identity
    };

    function _stepCat$1 (obj) {
      if (_isTransformer$1(obj)) {
        return obj
      }

      if (_isArrayLike$1(obj)) {
        return _stepCatArray$1
      }

      if (typeof obj === 'string') {
        return _stepCatString$1
      }

      if (typeof obj === 'object') {
        return _stepCatObject$1
      }

      throw new Error('Cannot create transformer for ' + obj)
    }

    function _getSelectFn (columns) {
      return row => {
        const newRow = {};

        for (let i = 0; i < columns.length; i++) {
          const columnName = columns[i];
          newRow[columnName] = row[columnName];
        }

        return newRow
      }
    }

    const _xnestBy = curryN(3, function _xnestBy (nestInstructions, by, xf) {
      return new XNestBy(nestInstructions, by, xf)
    });

    const nestBy = curryN(3, _dispatchable([], _xnestBy,
      function (nestInstructions, by, df) {
        return into(
          [],
          nestBy(nestInstructions, by),
          df
        )
      }
    ));

    function XNestBy (nestInstructions, by, xf) {
      const nestInstructionsIsObj = nestInstructions.constructor === Object;

      this.nestColName = nestInstructionsIsObj
        ? nestInstructions.column
        : nestInstructions;

      this.getAccumulator = nestInstructionsIsObj && nestInstructions.getAccumulator
        ? nestInstructions.getAccumulator
        : () => [];

      this.by = by;
      this.xf = xf;

      this.select = null;
      this.nestedDataById = {};
      this.accumulatorById = {};

      this.init = true;
    }

    XNestBy.prototype['@@transducer/init'] = _xfBase.init;
    XNestBy.prototype['@@transducer/result'] = _result$1;
    XNestBy.prototype['@@transducer/step'] = function (acc, row) {
      if (this.init) {
        this._initStep(acc, row);
        this.init = false;
      }

      return this._step(acc, row)
    };
    XNestBy.prototype._initStep = _initStep$1;
    XNestBy.prototype._step = _step$3;

    function _result$1 () {
      return this.xf['@@transducer/result'](_reduceObjVals(
        this.xf['@@transducer/step'].bind(this.xf),
        this.xf['@@transducer/init'](),
        this.nestedDataById
      ))
    }

    function _initStep$1 (acc, row) {
      const bySet = new Set(this.by);
      const nestedColumns = [];

      for (const columnName in row) {
        if (!bySet.has(columnName)) {
          nestedColumns.push(columnName);
        }
      }

      this.select = _getSelectFn(nestedColumns);
    }

    function _step$3 (acc, row) {
      const id = _idFromCols(row, this.by);
      const newId = !(id in this.accumulatorById);

      if (newId) {
        this.accumulatorById[id] = _stepCat$1(this.getAccumulator());

        const nestRow = _initNestRow(
          row,
          this.nestColName,
          this.by,
          this.accumulatorById[id]['@@transducer/init']()
        );

        this.nestedDataById[id] = nestRow;
      }

      const xf = this.accumulatorById[id];

      this.nestedDataById[id][this.nestColName] = xf['@@transducer/step'](
        this.nestedDataById[id][this.nestColName],
        this.select(row)
      );

      return acc
    }

    function _initNestRow (row, nestColName, by, initVal) {
      const nestRow = {};

      for (let i = 0; i < by.length; i++) {
        const colName = by[i];
        nestRow[colName] = row[colName];
      }

      nestRow[nestColName] = initVal;

      return nestRow
    }

    const _xsummariseByIrreducable = (summariseFn, by, xf) => {
      return new XSummariseByIrreducable(summariseFn, by, xf)
    };

    function XSummariseByIrreducable (summariseFn, by, xf) {
      this.summariseFn = summariseFn;
      this.by = by;
      this.xf = xf;

      this.nestColName = Symbol('nested');
      this.getAccumulator = accumulator;

      this.nestedColumns = [];
      this.nestedDataById = {};
      this.accumulatorById = {};

      this.init = true;
    }

    XSummariseByIrreducable.prototype['@@transducer/init'] = _xfBase.init;
    XSummariseByIrreducable.prototype['@@transducer/result'] = _result$2;
    XSummariseByIrreducable.prototype['@@transducer/step'] = function (acc, row) {
      if (this.init) {
        this._initStep(acc, row);
        this.init = false;
      }

      return this._step(acc, row)
    };
    XSummariseByIrreducable.prototype._initStep = _initStep$1;
    XSummariseByIrreducable.prototype._step = _step$3;
    XSummariseByIrreducable.prototype._finalStep = _finalStep$1;

    function _result$2 () {
      return this.xf['@@transducer/result'](_reduceObjVals(
        this._finalStep.bind(this),
        this.xf['@@transducer/init'](),
        this.nestedDataById
      ))
    }

    function _finalStep$1 (acc, row) {
      const summarizedRow = this.summariseFn(row[this.nestColName]);

      for (let i = 0; i < this.by.length; i++) {
        const byCol = this.by[i];
        summarizedRow[byCol] = row[byCol];
      }

      return this.xf['@@transducer/step'](acc, summarizedRow)
    }

    const _xsummariseBy = curryN(3, (summariseFn, by, xf) => {
      return _isReducable(summariseFn)
        ? _xsummariseByReducable(summariseFn, by, xf)
        : _xsummariseByIrreducable(summariseFn, by, xf)
    });

    const summariseBy = curryN(3, _dispatchable([], _xsummariseBy,
      function (summariseFn, by, df) {
        return into(
          [],
          summariseBy(summariseFn, by),
          df
        )
      }
    ));

    function _isReducable (summariseFn) {
      try {
        const summariseInstructions = summariseFn({});

        for (const newColumnName in summariseInstructions) {
          if (summariseInstructions[newColumnName] !== REDUCABLE) {
            return false
          }
        }
      } catch (e) {
        return false
      }

      return true
    }

    const _xfilterByReducable = (summariseFn, predicate, by, xf) => {
      return new XFilterByReducable(summariseFn, predicate, by, xf)
    };

    function XFilterByReducable (summariseFn, predicate, by, xf) {
      this.instructions = _getReducableInstructions(summariseFn);
      this.predicate = predicate;
      this.by = by;
      this.xf = xf;

      this.summarizedDataById = {};
      this.rows = [];
      this.ids = [];
    }

    XFilterByReducable.prototype['@@transducer/init'] = _xfBase.init;
    XFilterByReducable.prototype['@@transducer/result'] = _result$3;
    XFilterByReducable.prototype['@@transducer/step'] = _step$4;

    function _result$3 () {
      for (const id in this.summarizedDataById) {
        for (const newColumnName in this.instructions) {
          const resultFn = this
            .instructions[newColumnName]
            .xf['@@transducer/result'];

          this.summarizedDataById[id][newColumnName] = resultFn(
            this.summarizedDataById[id][newColumnName]
          );
        }
      }

      let acc = this.xf['@@transducer/init']();
      let idx = 0;
      const len = this.rows.length;

      while (idx < len) {
        const row = this.rows[idx];
        const id = this.ids[idx];

        if (this.predicate(row, this.summarizedDataById[id])) {
          acc = this.xf['@@transducer/step'](acc, row);
        }

        if (acc && acc['@@transducer/reduced']) {
          acc = acc['@@transducer/value'];
          break
        }

        idx++;
      }

      return this.xf['@@transducer/result'](acc)
    }

    function _step$4 (acc, row) {
      const id = _idFromCols(row, this.by);
      const newId = !(id in this.summarizedDataById);

      this.rows.push(row);
      this.ids.push(id);

      if (newId) {
        this.summarizedDataById[id] = _initSummaryGroup(
          this.instructions,
          row,
          this.by
        );
      }

      this.summarizedDataById[id] = _updateSummaryGroup(
        this.summarizedDataById[id],
        this.instructions,
        row
      );

      return acc
    }

    // import _reduceObjVals from './_reduceObjVals.js'

    const _xfilterByIrreducable = (summariseFn, predicate, by, xf) => {
      return new XFilterByIrreducable(summariseFn, predicate, by, xf)
    };

    function XFilterByIrreducable (summariseFn, predicate, by, xf) {
      this.summariseFn = summariseFn;
      this.predicate = predicate;
      this.by = by;
      this.xf = xf;

      this.nestColName = Symbol('nested');
      this.getAccumulator = accumulator;

      this.nestedColumns = [];
      this.nestedDataById = {};
      this.accumulatorById = {};
      this.rows = [];
      this.ids = [];

      this.init = true;
    }

    XFilterByIrreducable.prototype['@@transducer/init'] = _xfBase.init;
    XFilterByIrreducable.prototype['@@transducer/result'] = _result$4;
    XFilterByIrreducable.prototype['@@transducer/step'] = function (acc, row) {
      if (this.init) {
        this._initStep(acc, row);
        this.init = false;
      }

      return this._step(acc, row)
    };
    XFilterByIrreducable.prototype._initStep = _initStep$1;
    XFilterByIrreducable.prototype._step = _step$5;

    function _result$4 () {
      for (const id in this.nestedDataById) {
        const row = this.nestedDataById[id];

        const summarizedRow = this.summariseFn(row[this.nestColName]);

        for (let i = 0; i < this.by.length; i++) {
          const byCol = this.by[i];
          summarizedRow[byCol] = row[byCol];
        }

        this.nestedDataById[id] = summarizedRow;
      }

      this.summarizedDataById = this.nestedDataById;
      this.nestedDataById = null;

      let acc = this.xf['@@transducer/init']();
      let idx = 0;
      const len = this.rows.length;

      while (idx < len) {
        const row = this.rows[idx];
        const id = this.ids[idx];

        if (this.predicate(row, this.summarizedDataById[id])) {
          acc = this.xf['@@transducer/step'](acc, row);
        }

        if (acc && acc['@@transducer/reduced']) {
          acc = acc['@@transducer/value'];
          break
        }

        idx++;
      }

      return this.xf['@@transducer/result'](acc)
    }

    function _step$5 (acc, row) {
      const id = _idFromCols(row, this.by);
      const newId = !(id in this.accumulatorById);

      this.rows.push(row);
      this.ids.push(id);

      if (newId) {
        this.accumulatorById[id] = _stepCat$1(this.getAccumulator());

        const nestRow = _initNestRow(
          row,
          this.nestColName,
          this.by,
          this.accumulatorById[id]['@@transducer/init']()
        );

        this.nestedDataById[id] = nestRow;
      }

      const xf = this.accumulatorById[id];

      this.nestedDataById[id][this.nestColName] = xf['@@transducer/step'](
        this.nestedDataById[id][this.nestColName],
        this.select(row)
      );

      return acc
    }

    const _xfilterBy = curryN(4, function _xfilterBy (summariseFn, predicate, by, xf) {
      return _isReducable(summariseFn)
        ? _xfilterByReducable(summariseFn, predicate, by, xf)
        : _xfilterByIrreducable(summariseFn, predicate, by, xf)
    });

    const filterBy = curryN(4, _dispatchable([], _xfilterBy,
      function (summariseFn, predicate, by, df) {
        return into(
          [],
          filterBy(summariseFn, predicate, by),
          df
        )
      }
    ));

    const _xpivotLonger = curryN(2, function _xpivotLonger (pivotInstructions, xf) {
      return new XPivotLonger(pivotInstructions, xf)
    });

    const pivotLonger = curryN(2, _dispatchable([], _xpivotLonger,
      function (pivotInstructions, df) {
        return into(
          [],
          pivotLonger(pivotInstructions),
          df
        )
      }
    ));

    function XPivotLonger ({ columns, namesTo, valuesTo }, xf) {
      this.pivotColumns = columns;
      this.pivotColumnsSet = new Set(columns);
      this.namesTo = namesTo;
      this.valuesTo = valuesTo;
      this.xf = xf;

      this.columns = null;
      this.idColumns = null;

      this.init = true;
    }

    XPivotLonger.prototype['@@transducer/init'] = _xfBase.init;
    XPivotLonger.prototype['@@transducer/result'] = _xfBase.result;
    XPivotLonger.prototype['@@transducer/step'] = function (acc, row) {
      if (this.init) {
        this._initStep(acc, row);
        this.init = false;
      }

      return this._step(acc, row)
    };
    XPivotLonger.prototype._initStep = _initStep$2;
    XPivotLonger.prototype._step = _step$6;

    function _initStep$2 (acc, row) {
      this.columns = Object.keys(row);

      this.idColumns = this.columns.filter(
        columnName => !this.pivotColumnsSet.has(columnName)
      );
    }

    function _step$6 (acc, row) {
      const newRows = [];

      for (let j = 0; j < this.pivotColumns.length; j++) {
        const newRow = {};

        const pivotColumnName = this.pivotColumns[j];
        const pivotColumnValue = row[pivotColumnName];

        newRow[this.namesTo] = pivotColumnName;
        newRow[this.valuesTo] = pivotColumnValue;

        for (let k = 0; k < this.idColumns.length; k++) {
          const idColumnName = this.idColumns[k];
          newRow[idColumnName] = row[idColumnName];
        }

        newRows.push(newRow);
      }

      return reduce(
        this.xf['@@transducer/step'].bind(this.xf),
        acc,
        newRows
      )
    }

    const _xpivotWider = curryN(2, function _xpivotWider (pivotInstructions, xf) {
      return new XPivotWider(pivotInstructions, xf)
    });

    const pivotWider = curryN(2, _dispatchable([], _xpivotWider,
      function (pivotInstructions, df) {
        return into(
          [],
          pivotWider(pivotInstructions),
          df
        )
      }
    ));

    function XPivotWider ({ namesFrom, valuesFrom, valuesFill = null }, xf) {
      this.namesFrom = namesFrom;
      this.valuesFrom = valuesFrom;
      this.valuesFill = valuesFill;
      this.xf = xf;

      this.idColumns = null;
      this.widerRowsById = {};
      this.newColumnsSet = new Set();
      this.newColumns = null;

      this.init = true;
    }

    XPivotWider.prototype['@@transducer/init'] = _xfBase.init;
    XPivotWider.prototype['@@transducer/result'] = _result$5;
    XPivotWider.prototype['@@transducer/step'] = function (acc, row) {
      if (this.init) {
        this._initStep(acc, row);
        this.init = false;
      }

      return this._step(acc, row)
    };
    XPivotWider.prototype._initStep = _initStep$3;
    XPivotWider.prototype._step = _step$7;
    XPivotWider.prototype._finalStep = _finalStep$2;

    function _result$5 () {
      this.newColumns = Array.from(this.newColumnsSet);

      return this.xf['@@transducer/result'](_reduceObjVals(
        this._finalStep.bind(this),
        this.xf['@@transducer/init'](),
        this.widerRowsById
      ))
    }

    function _initStep$3 (acc, row) {
      const columns = Object.keys(row);
      const nonIdColumns = [this.namesFrom, this.valuesFrom];
      this.idColumns = columns.filter(c => !nonIdColumns.includes(c));
    }

    function _step$7 (acc, row) {
      const id = _idFromCols(row, this.idColumns);
      const newId = !(id in this.widerRowsById);

      if (newId) {
        const widerRow = {};

        for (let i = 0; i < this.idColumns.length; i++) {
          const idColumn = this.idColumns[i];
          widerRow[idColumn] = row[idColumn];
        }

        this.widerRowsById[id] = widerRow;
      }

      const column = row[this.namesFrom];
      const value = row[this.valuesFrom];

      this.widerRowsById[id][column] = value;
      this.newColumnsSet.add(column);
    }

    function _finalStep$2 (acc, row) {
      for (let i = 0; i < this.newColumns.length; i++) {
        const newColumn = this.newColumns[i];

        if (!(newColumn in row)) {
          row[newColumn] = this.valuesFill;
        }
      }

      return this.xf['@@transducer/step'](acc, row)
    }

    function _reduced (x) {
      return x && x['@@transducer/reduced']
        ? x
        : {
          '@@transducer/value': x,
          '@@transducer/reduced': true
        }
    }

    const _xslice = curryN(2, function _xslice (indices, xf) {
      return new XSlice(indices, xf)
    });

    const slice = curryN(2, _dispatchable([], _xslice,
      function (indices, df) {
        return into(
          [],
          slice(indices),
          df
        )
      }
    ));

    function XSlice (indices, xf) {
      this.indices = new Set(indices);
      this.xf = xf;

      this.counter = -1;
    }

    XSlice.prototype['@@transducer/init'] = _xfBase.init;
    XSlice.prototype['@@transducer/result'] = _xfBase.result;
    XSlice.prototype['@@transducer/step'] = function (acc, row) {
      this.counter++;

      if (this.indices.has(this.counter)) {
        this.indices.delete(this.counter);
        const output = this.xf['@@transducer/step'](acc, row);

        return this.indices.size === 0
          ? _reduced(output)
          : output
      }

      return acc
    };

    const _xunnest = curryN(3, function _xunnest (nestColName, nestWrapper, xf) {
      return new XUnnest(nestColName, nestWrapper, xf)
    });

    const unnest = curryN(3, _dispatchable([], _xunnest,
      function (nestColName, nestWrapper, df) {
        return into(
          [],
          unnest(nestColName, nestWrapper),
          df
        )
      }
    ));

    function XUnnest (nestColName, nestWrapper, xf) {
      this.nestColName = nestColName;
      this.nestWrapper = nestWrapper;
      this.xf = xf;
      this.outerColumns = [];

      this.init = true;
    }

    XUnnest.prototype['@@transducer/init'] = _xfBase.init;
    XUnnest.prototype['@@transducer/result'] = _xfBase.result;
    XUnnest.prototype['@@transducer/step'] = function (acc, row) {
      if (this.init) {
        this._initStep(acc, row);
        this.init = false;
      }

      return this._step(acc, row)
    };

    XUnnest.prototype._initStep = function (acc, row) {
      for (const columnName in row) {
        if (columnName !== this.nestColName) {
          this.outerColumns.push(columnName);
        }
      }
    };

    XUnnest.prototype._step = function (acc, row) {
      const nestedData = row[this.nestColName];

      const rowWithoutNested = Object.assign({}, row);
      delete rowWithoutNested[this.nestColName];

      return reduce(
        (innerAcc, innerRow) => this.xf[['@@transducer/step']](
          innerAcc,
          _attach(innerRow, rowWithoutNested)
        ),
        acc,
        this.nestWrapper(nestedData)
      )
    };

    function _attach (innerRow, outerRow) {
      const newRow = Object.assign({}, innerRow);

      for (const columnName in outerRow) {
        newRow[columnName] = outerRow[columnName];
      }

      return newRow
    }

    function pivotLonger$1 (_data, pivotInstructions) {
      const data = Object.assign({}, _data);
      delete data.$key;

      return into(
        columnOriented.accumulator(),
        pivotLonger(pivotInstructions),
        columnOriented.wrap(data)
      )
    }

    function pivotWider$1 (_data, pivotInstructions) {
      const data = Object.assign({}, _data);
      delete data.$key;

      return into(
        columnOriented.accumulator(),
        pivotWider(pivotInstructions),
        columnOriented.wrap(data)
      )
    }

    const transformations = {
      filter,
      select,
      arrange,
      rename,
      mutate,
      transmute,
      summarise,
      mutarise,
      groupBy,
      bin,
      dropNA,
      reproject,
      transform,
      cumsum,
      rowCumsum,
      pivotLonger: pivotLonger$1,
      pivotWider: pivotWider$1
    };

    const methods$2 = {
      arrange (sortInstructions) {
        const data = transformations.arrange(this._data, sortInstructions);
        return new DataContainer(data, { validate: false })
      },

      bin (binInstructions) {
        const data = transformations.bin(this._data, binInstructions);
        return new DataContainer(data, { validate: false })
      },

      cumsum (cumsumInstructions, options) {
        const data = transformations.cumsum(this._data, cumsumInstructions, options);
        return new DataContainer(data, { validate: false })
      },

      dropNA (dropInstructions) {
        const data = transformations.dropNA(this._data, dropInstructions);
        return new DataContainer(data, { validate: false })
      },

      filter (filterFunction) {
        const data = transformations.filter(this._data, filterFunction);
        return new DataContainer(data, { validate: false })
      },

      groupBy (groupByInstructions) {
        const data = transformations.groupBy(this._data, groupByInstructions);
        return new DataContainer(data, { validate: false })
      },

      mutarise (mutariseInstructions) {
        const data = transformations.mutarise(this._data, mutariseInstructions);
        return new DataContainer(data, { validate: false })
      },

      mutarize (mutariseInstructions) {
        const data = transformations.mutarise(this._data, mutariseInstructions);
        return new DataContainer(data, { validate: false })
      },

      mutate (mutateInstructions) {
        const data = transformations.mutate(this._data, mutateInstructions);
        return new DataContainer(data, { validate: false })
      },

      pivotLonger (pivotInstructions) {
        const data = transformations.pivotLonger(this._data, pivotInstructions);
        return new DataContainer(data, { validate: false })
      },

      pivotWider (pivotInstructions) {
        const data = transformations.pivotWider(this._data, pivotInstructions);
        return new DataContainer(data, { validate: false })
      },

      transmute (transmuteInstructions) {
        const data = transformations.transmute(this._data, transmuteInstructions);
        return new DataContainer(data, { validate: false })
      },

      rename (renameInstructions) {
        const data = transformations.rename(this._data, renameInstructions);
        return new DataContainer(data, { validate: false })
      },

      reproject (reprojectInstructions) {
        const data = transformations.reproject(this._data, reprojectInstructions);
        return new DataContainer(data, { validate: false })
      },

      rowCumsum (cumsumInstructions, options) {
        const data = transformations.rowCumsum(this._data, cumsumInstructions, options);
        return new DataContainer(data, { validate: false })
      },

      select (selection) {
        const data = transformations.select(this._data, selection);
        return new DataContainer(data, { validate: false })
      },

      summarise (summariseInstructions) {
        const data = transformations.summarise(this._data, summariseInstructions);
        return new DataContainer(data, { validate: false })
      },

      summarize (summariseInstructions) {
        const data = transformations.summarise(this._data, summariseInstructions);
        return new DataContainer(data, { validate: false })
      },

      transform (transformFunction) {
        const data = transformations.transform(this._data, transformFunction);
        return new DataContainer(data, { validate: false })
      }
    };

    function transformationsMixin (targetClass) {
      Object.assign(targetClass.prototype, methods$2);
    }

    function ensureValidRow (row, self) {
      for (const columnName in row) {
        if (!(columnName in self._data)) throw new Error(`Column '${columnName}' not found`)
      }

      for (const columnName in self._data) {
        if (columnName === '$key') {
          if (columnName in row) throw new Error('Cannot set \'$key\' column')
        } else {
          if (!(columnName in row)) throw new Error(`Missing column '${columnName}'`)

          const value = row[columnName];
          ensureValueIsRightForColumn(value, columnName, self);
        }
      }
    }

    function ensureValidRowUpdate (row, self) {
      for (const columnName in row) {
        if (!(columnName in self._data)) throw new Error(`Column '${columnName}' not found`)

        const value = row[columnName];
        ensureValueIsRightForColumn(value, columnName, self);
      }
    }

    function ensureRowExists (accessorObject, self) {
      if (isUndefined(self._rowIndex(accessorObject))) {
        throw new Error(`Invalid accessor object: '${accessorObject.toString()}'`)
      }
    }

    function ensureValueIsRightForColumn (value, columnName, self) {
      if (!isInvalid(value)) {
        const columnType = getColumnType(self._data[columnName]);

        ensureValidDataType(value);
        const valueType = getDataType(value);

        if (columnType !== valueType) {
          throw new Error(`Column '${columnName}' is of type '${columnType}'. Received value of type '${valueType}'`)
        }
      }
    }

    function isValidColumn (column, columnName) {
      const columnType = getColumnType(column);

      if (columnType === undefined) return false
      if (!columnNameMatchesType(columnName, columnType)) return false
      if (!allValidValuesHaveTheSameType(column, columnType)) return false

      return true
    }

    function ensureValidColumn (column, columnName) {
      const { nValidValues } = findFirstValidValue(column);

      if (nValidValues === 0) {
        throw new Error(`Invalid column '${columnName}'. Column contains only invalid values.`)
      }

      const columnType = getColumnType(column);

      if (columnType === undefined) throw new Error(`Column '${columnName}' contains data of unknown type`)
      ensureColumnNameMatchesType(columnType);
      ensureAllValidValuesHaveTheSameType(column, columnType, columnName);
    }

    function columnNameMatchesType (columnName, columnType) {
      if (columnName === '$geometry' && columnType !== 'geometry') return false
      if (columnName !== '$geometry' && columnType === 'geometry') return false

      return true
    }

    function ensureColumnNameMatchesType (columnName, columnType) {
      if (columnName === '$geometry' && columnType !== 'geometry') {
        throw new Error(`Column '$geometry' can only contain data of type 'geometry', received '${columnType}'`)
      }

      if (columnName !== '$geometry' && columnType === 'geometry') {
        throw new Error(`Only the '$geometry' column can contain data of type 'geometry'`)
      }
    }

    function allValidValuesHaveTheSameType (column, columnType) {
      for (let i = 0; i < column.length; i++) {
        const value = column[i];

        if (isInvalid(value)) continue

        const valueType = getDataType(value);

        if (valueType !== columnType) {
          return false
        }
      }

      return true
    }

    function ensureAllValidValuesHaveTheSameType (column, columnType, columnName) {
      if (!allValidValuesHaveTheSameType(column, columnType)) {
        throw new Error(`Column '${columnName}' mixes types`)
      }
    }

    function columnExists (columnName, self) {
      return columnName in self._data
    }

    function ensureColumnExists (columnName, self) {
      if (!columnExists(columnName, self)) {
        throw new Error(`Invalid column name: '${columnName}'`)
      }
    }

    const methods$3 = {
      // Rows
      addRow (row) {
        ensureValidRow(row, this);

        for (const columnName in row) {
          const value = row[columnName];
          this._data[columnName].push(value);

          this._updateDomainIfNecessary(columnName, value);
        }

        const rowIndex = getDataLength(this._data) - 1;

        if (!this._keyColumn) {
          const key = incrementKey(this._data.$key);

          this._data.$key.push(key);
          this._keyToRowIndex.set(key, rowIndex);
        }

        if (this._keyColumn) {
          const key = row[this._keyColumn];

          if (this._keyToRowIndex.has(key)) {
            throw new Error(`Duplicate key '${key}'`)
          }

          this._keyToRowIndex.set(key, rowIndex);
        }
      },

      updateRow (accessorObject, row) {
        if (row.constructor === Function) {
          const result = row(this.row(accessorObject));

          if (!(result && result.constructor === Object)) {
            throw new Error('updateRow function must return Object')
          }

          this.updateRow(accessorObject, result);
        }

        ensureRowExists(accessorObject, this);
        ensureValidRowUpdate(row, this);

        const rowIndex = this._rowIndex(accessorObject);

        if (this._keyColumn && this._keyColumn in row) {
          const oldKey = this._row(rowIndex).$key;
          const newKey = row[this._keyColumn];

          if (
            newKey !== oldKey &&
            this._keyToRowIndex.has(newKey)
          ) {
            throw new Error(`Duplicate key '${newKey}'`)
          }

          this._keyToRowIndex.delete(oldKey);
          this._keyToRowIndex.set(newKey, rowIndex);
        }

        for (const columnName in row) {
          throwErrorIfColumnIsKey(columnName);

          const value = row[columnName];
          this._data[columnName][rowIndex] = value;

          this._resetDomainIfNecessary(columnName);
        }
      },

      deleteRow (accessorObject) {
        ensureRowExists(accessorObject, this);

        const rowIndex = this._rowIndex(accessorObject);
        const key = this._row(rowIndex).$key;

        this._keyToRowIndex.delete(key);

        for (const columnName in this._data) {
          if (!(this._keyColumn && columnName === '$key')) {
            this._data[columnName].splice(rowIndex, 1);
            this._resetDomainIfNecessary(columnName);
          }
        }
      },

      // Columns
      addColumn (columnName, column) {
        this._validateNewColumn(columnName, column);
        this._data[columnName] = column;
      },

      replaceColumn (columnName, column) {
        this.deleteColumn(columnName);
        this.addColumn(columnName, column);
      },

      deleteColumn (columnName) {
        ensureColumnExists(columnName, this);
        throwErrorIfColumnIsKey(columnName);

        if (Object.keys(this._data).length === 2) {
          throw new Error('Cannot delete last column')
        }

        delete this._data[columnName];
      },

      // Private methods
      _updateDomainIfNecessary (columnName, value) {
        const type = getDataType(value);

        if (columnName in this._domains) {
          this._domains[columnName] = updateDomain(
            this._domains[columnName],
            value,
            type
          );
        }
      },

      _resetDomainIfNecessary (columnName) {
        if (columnName in this._domains) {
          delete this._domains[columnName];
        }
      },

      _validateNewColumn (columnName, column) {
        checkRegularColumnName(columnName);

        if (columnName in this._data) {
          throw new Error(`Column '${columnName}' already exists`)
        }

        const dataLength = getDataLength(this._data);
        if (dataLength !== column.length) {
          throw new Error('Column must be of same length as rest of data')
        }

        ensureValidColumn(column);
      }
    };

    function modifyingRowsAndColumnsMixin (targetClass) {
      Object.assign(targetClass.prototype, methods$3);
    }

    function throwErrorIfColumnIsKey (columnName) {
      if (columnName === '$key') throw new Error('Cannot modify key column')
    }

    function ascending(a, b) {
      return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
    }

    function bisector(f) {
      let delta = f;
      let compare = f;

      if (f.length === 1) {
        delta = (d, x) => f(d) - x;
        compare = ascendingComparator(f);
      }

      function left(a, x, lo, hi) {
        if (lo == null) lo = 0;
        if (hi == null) hi = a.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (compare(a[mid], x) < 0) lo = mid + 1;
          else hi = mid;
        }
        return lo;
      }

      function right(a, x, lo, hi) {
        if (lo == null) lo = 0;
        if (hi == null) hi = a.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (compare(a[mid], x) > 0) hi = mid;
          else lo = mid + 1;
        }
        return lo;
      }

      function center(a, x, lo, hi) {
        if (lo == null) lo = 0;
        if (hi == null) hi = a.length;
        const i = left(a, x, lo, hi);
        return i > lo && delta(a[i - 1], x) > -delta(a[i], x) ? i - 1 : i;
      }

      return {left, center, right};
    }

    function ascendingComparator(f) {
      return (d, x) => ascending(f(d), x);
    }

    var ascendingBisect = bisector(ascending);
    var bisectRight = ascendingBisect.right;

    function initRange(domain, range) {
      switch (arguments.length) {
        case 0: break;
        case 1: this.range(domain); break;
        default: this.range(range).domain(domain); break;
      }
      return this;
    }

    function threshold() {
      var domain = [0.5],
          range = [0, 1],
          unknown,
          n = 1;

      function scale(x) {
        return x <= x ? range[bisectRight(domain, x, 0, n)] : unknown;
      }

      scale.domain = function(_) {
        return arguments.length ? (domain = Array.from(_), n = Math.min(domain.length, range.length - 1), scale) : domain.slice();
      };

      scale.range = function(_) {
        return arguments.length ? (range = Array.from(_), n = Math.min(domain.length, range.length - 1), scale) : range.slice();
      };

      scale.invertExtent = function(y) {
        var i = range.indexOf(y);
        return [domain[i - 1], domain[i]];
      };

      scale.unknown = function(_) {
        return arguments.length ? (unknown = _, scale) : unknown;
      };

      scale.copy = function() {
        return threshold()
            .domain(domain)
            .range(range)
            .unknown(unknown);
      };

      return initRange.apply(scale, arguments);
    }

    const methods$4 = {
      bounds (binInstructions) {
        const bounds = this.fullBounds(binInstructions);
        return bounds.slice(1, bounds.length - 1)
      },

      fullBounds (binInstructions) {
        if (this.type(binInstructions.column) !== 'quantitative') {
          throw new Error('Column should be of type \'quantitative\'')
        }

        const bounds = getIntervalBounds(
          this._data,
          binInstructions
        );

        return bounds
      },

      boundRanges (binInstructions) {
        const bounds = this.fullBounds(binInstructions);
        const boundRanges = [];

        for (let i = 0; i < bounds.length - 1; i++) {
          boundRanges.push([bounds[i], bounds[i + 1]]);
        }

        return boundRanges
      },

      classify (binInstructions, range) {
        const bounds = this.bounds(binInstructions);

        return threshold()
          .domain(bounds)
          .range(range)
      }
    };

    function classificationMixin (targetClass) {
      Object.assign(targetClass.prototype, methods$4);
    }

    function getJoinColumns (left, right, by) {
      const leftData = left.data();
      const rightData = right.data();

      if (isUndefined(by)) {
        const leftDataLength = getDataLength(leftData);
        const joinColumns = {};

        for (const columnName in rightData) {
          if (columnName !== '$key') {
            const rightColumn = rightData[columnName];
            joinColumns[columnName] = rightColumn.slice(0, leftDataLength);
          }
        }

        return joinColumns
      }

      if (isDefined(by)) {
        const joinColumns = initJoinColumns(rightData, by[1]);

        const rightRowsByKey = generateRightRowsByKey(rightData, by[1]);
        const leftByColumn = leftData[by[0]];

        for (let i = 0; i < leftByColumn.length; i++) {
          const leftKey = leftByColumn[i];
          const row = rightRowsByKey[leftKey];

          for (const columnName in row) {
            joinColumns[columnName].push(row[columnName]);
          }
        }

        return joinColumns
      }
    }

    function initJoinColumns (right, byColumnName) {
      const joinColumns = {};

      for (const columnName in right) {
        if (columnName !== '$key' && columnName !== byColumnName) {
          joinColumns[columnName] = [];
        }
      }

      return joinColumns
    }

    function generateRightRowsByKey (right, byColumnName) {
      const rightRowsByKey = {};
      const byColumn = right[byColumnName];

      for (let i = 0; i < byColumn.length; i++) {
        const key = byColumn[i];
        const row = {};

        for (const columnName in right) {
          if (columnName !== '$key' && columnName !== byColumnName) {
            row[columnName] = right[columnName][i];
          }
        }

        rightRowsByKey[key] = row;
      }

      return rightRowsByKey
    }

    function validateJoin (left, right, by) {
      const leftData = left.data();
      const rightData = getRightData(right);

      if (isUndefined(by)) {
        const leftLength = getDataLength(leftData);
        const rightLength = getDataLength(rightData);

        if (rightLength < leftLength) {
          throw new Error(
            'Without \'by\', the right DataContainer must be the same length as or longer than left DataContainer'
          )
        }
      }

      if (isDefined(by)) {
        validateByColumnsExist(leftData, rightData, by);
        ensureColumnsAreCompatible(leftData, rightData, by);
        ensureNoDuplicateColumnNames(leftData, rightData, by);
      }
    }

    function getRightData (right) {
      if (!(right instanceof DataContainer)) {
        throw new Error('It is only possible to join another DataContainer')
      }

      return right.data()
    }

    function validateByColumnsExist (left, right, by) {
      if (!(by.constructor === Array && by.length === 2 && by.every(c => c.constructor === String))) {
        throw new Error('Invalid format of \'by\'. Must be Array of two column names.')
      }

      const [leftColumnName, rightColumnName] = by;

      if (!(leftColumnName in left)) {
        throw new Error(`Column '${leftColumnName}' not found`)
      }

      if (!(rightColumnName in right)) {
        throw new Error(`Column '${rightColumnName}' not found`)
      }
    }

    function ensureColumnsAreCompatible (left, right, by) {
      const [leftColumnName, rightColumnName] = by;
      const leftColumn = left[leftColumnName];
      const rightColumn = right[rightColumnName];

      const leftType = getColumnType(leftColumn);
      const rightType = getColumnType(rightColumn);

      if (leftType !== rightType) throw new Error('\'by\' columns must be of the same type')

      ensureRightByColumnIsUnique(right[rightColumnName]);
      ensureLeftColumnIsSubsetOfRightColumn(leftColumn, rightColumn);
    }

    function ensureRightByColumnIsUnique (column) {
      if (column.length !== new Set(column).size) {
        throw new Error('Right \'by\' column must contain only unique values')
      }
    }

    function ensureLeftColumnIsSubsetOfRightColumn (leftColumn, rightColumn) {
      const rightSet = new Set(rightColumn);

      for (let i = 0; i < leftColumn.length; i++) {
        const leftKey = leftColumn[i];
        if (!rightSet.has(leftKey)) {
          throw new Error('Left \'by\' column must be subset of right column')
        }
      }
    }

    function ensureNoDuplicateColumnNames (left, right, by) {
      const rightColumnName = by[1];

      for (const columnName in right) {
        if (columnName !== '$key' && columnName in left) {
          if (columnName !== rightColumnName) {
            throw new Error(`Duplicate column name: '${columnName}'`)
          }
        }
      }
    }

    function validateAccessorObject (accessorObject) {
      const keys = Object.keys(accessorObject);

      if (
        accessorObject &&
        accessorObject.constructor === Object &&
        keys.length === 1 &&
        ['index', 'key'].includes(keys[0])
      ) {
        return
      }

      throw new Error('Invalid accessor object, must be either \'{ index: <index> }\'  or \'{ key: <key> }\'')
    }

    class DataContainer {
      constructor (data, options = { validate: true }) {
        this._data = {};
        this._keyToRowIndex = new Map();
        this._keyColumn = null;
        this._domains = {};

        if (isColumnOriented(data)) {
          this._setColumnData(data, options);
          return
        }

        if (isRowOriented(data)) {
          this._setRowData(data, options);
          return
        }

        if (isGeoJSON(data)) {
          this._setGeoJSON(data, options);
          return
        }

        if (data instanceof Group) {
          this._setGroup(data, options);
          return
        }

        throw invalidDataError
      }

      // Accessing data
      data () {
        return this._data
      }

      row (accessorObject) {
        const rowIndex = this._rowIndex(accessorObject);
        return this._row(rowIndex)
      }

      rows () {
        const rows = [];
        const length = getDataLength(this._data);

        for (let i = 0; i < length; i++) {
          rows.push(this._row(i));
        }

        return rows
      }

      column (columnName) {
        ensureColumnExists(columnName, this);
        return this._data[columnName]
      }

      map (columnName, mapFunction) {
        return this.column(columnName).map(mapFunction)
      }

      domain (columnName) {
        if (columnName in this._domains) {
          return this._domains[columnName]
        }

        const column = this.column(columnName);
        const domain = calculateDomain(column, columnName);
        this._domains[columnName] = domain;
        return domain
      }

      bbox () {
        return this.domain('$geometry')
      }

      min (columnName) {
        if (!['quantitative', 'interval'].includes(this.type(columnName))) {
          throw new Error('Column must be quantitative')
        }

        return this.domain(columnName)[0]
      }

      max (columnName) {
        if (!['quantitative', 'interval'].includes(this.type(columnName))) {
          throw new Error('Column must be quantitative')
        }

        return this.domain(columnName)[1]
      }

      type (columnName) {
        const column = this.column(columnName);
        return getColumnType(column)
      }

      columnNames () {
        return Object.keys(this._data)
      }

      nrow () {
        return getDataLength(this._data)
      }

      // Checks
      hasColumn (columnName) {
        return columnExists(columnName, this)
      }

      hasRow (accessorObject) {
        const rowIndex = this._rowIndex(accessorObject);
        const length = this.nrow();

        return typeof rowIndex !== 'undefined' && rowIndex < length && rowIndex >= 0
      }

      columnIsValid (columnName) {
        const column = this.column(columnName);
        return isValidColumn(column, columnName)
      }

      validateColumn (columnName) {
        const column = this.column(columnName);
        ensureValidColumn(column, columnName);
      }

      validateAllColumns () {
        for (const columnName in this._data) {
          this.validateColumn(columnName);
        }
      }

      // Join
      join (dataContainer, { by = undefined } = {}) {
        validateJoin(this, dataContainer, by);
        const joinColumns = getJoinColumns(this, dataContainer, by);

        for (const columnName in joinColumns) {
          this.addColumn(columnName, joinColumns[columnName]);
        }
      }

      // Private methods
      _rowIndex (accessorObject) {
        validateAccessorObject(accessorObject);

        const rowIndex = 'key' in accessorObject
          ? this._keyToRowIndex.get(accessorObject.key)
          : accessorObject.index;

        return rowIndex
      }

      _row (rowIndex) {
        const length = getDataLength(this._data);

        if (rowIndex < 0 || rowIndex >= length) {
          return undefined
        }

        const row = {};

        for (const columnName in this._data) {
          const value = this._data[columnName][rowIndex];
          row[columnName] = value;
        }

        return row
      }
    }

    dataLoadingMixin(DataContainer);
    keyMixin(DataContainer);
    transformationsMixin(DataContainer);
    modifyingRowsAndColumnsMixin(DataContainer);
    classificationMixin(DataContainer);

    const invalidDataError = new Error('Data passed to DataContainer is of unknown format');

    const data = [
      {
        Country: 'Latvia',
        YWBI: 32,
        PopAge: 44.4,
        LegAge: 47.3,
        Under20: 21.5,
        PopNum: 1.9,
        Income: 'High',
      },
      {
        Country: 'Slovenia',
        YWBI: 32,
        PopAge: 44.9,
        LegAge: 55.6,
        Under20: 19.6,
        PopNum: 2.1,
        Income: 'High',
      },
      {
        Country: 'Uruguay',
        YWBI: 19,
        PopAge: 35.8,
        LegAge: 48.7,
        Under20: 25,
        PopNum: 3.5,
        Income: 'High',
      },
      {
        Country: 'Costa Rica',
        YWBI: 21,
        PopAge: 32.6,
        LegAge: 48.9,
        Under20: 27.6,
        PopNum: 5.1,
        Income: 'Upper middle',
      },
      {
        Country: 'Norway',
        YWBI: 34,
        PopAge: 39.5,
        LegAge: 46.1,
        Under20: 23.1,
        PopNum: 5.4,
        Income: 'High',
      },
      {
        Country: 'Denmark',
        YWBI: 32,
        PopAge: 42,
        LegAge: 46.7,
        Under20: 22.1,
        PopNum: 5.8,
        Income: 'High',
      },
      {
        Country: 'Lebanon',
        YWBI: 18,
        PopAge: 29.6,
        LegAge: 60.4,
        Under20: 29,
        PopNum: 6.8,
        Income: 'Upper middle',
      },
      {
        Country: 'United Arab Emirates',
        YWBI: 25,
        PopAge: 38.4,
        LegAge: 48.5,
        Under20: 19.2,
        PopNum: 9.9,
        Income: 'High',
      },
      {
        Country: 'Jordan',
        YWBI: 18,
        PopAge: 23.8,
        LegAge: 52,
        Under20: 37,
        PopNum: 10.2,
        Income: 'Upper middle',
      },
      {
        Country: 'Czech Republic',
        YWBI: 26,
        PopAge: 43.3,
        LegAge: 50.4,
        Under20: 20.5,
        PopNum: 10.7,
        Income: 'High',
      },
      {
        Country: 'Bolivia',
        YWBI: 17,
        PopAge: 25.3,
        LegAge: 44.3,
        Under20: 39.4,
        PopNum: 11.7,
        Income: 'Lower middle',
      },
      {
        Country: 'Rwanda',
        YWBI: 9,
        PopAge: 19.7,
        LegAge: 46.8,
        Under20: 49.7,
        PopNum: 13,
        Income: 'Low',
      },
      {
        Country: 'Cambodia',
        YWBI: 7,
        PopAge: 26.4,
        LegAge: 64.3,
        Under20: 39.4,
        PopNum: 16.7,
        Income: 'Lower middle',
      },
      {
        Country: 'Netherlands',
        YWBI: 33,
        PopAge: 42.8,
        LegAge: 43.7,
        Under20: 21.4,
        PopNum: 17.5,
        Income: 'High',
      },
      {
        Country: 'Chile',
        YWBI: 25,
        PopAge: 35.5,
        LegAge: 47.3,
        Under20: 25.4,
        PopNum: 19.1,
        Income: 'High',
      },
      {
        Country: 'Romania',
        YWBI: 17,
        PopAge: 42.5,
        LegAge: 44.8,
        Under20: 20.7,
        PopNum: 19.2,
        Income: 'High',
      },
      {
        Country: 'Australia',
        YWBI: 31,
        PopAge: 37.5,
        LegAge: 50.7,
        Under20: 25.3,
        PopNum: 25.5,
        Income: 'High',
      },
      {
        Country: 'Ghana',
        YWBI: 9,
        PopAge: 21.4,
        LegAge: 49,
        Under20: 46.9,
        PopNum: 31.1,
        Income: 'Lower middle',
      },
      {
        Country: 'Malaysia',
        YWBI: 19,
        PopAge: 29.2,
        LegAge: 55.9,
        Under20: 31.3,
        PopNum: 32.4,
        Income: 'Upper middle',
      },
      {
        Country: 'Peru',
        YWBI: 9,
        PopAge: 31,
        LegAge: 48.3,
        Under20: 30,
        PopNum: 33,
        Income: 'Upper middle',
      },
      {
        Country: 'Canada',
        YWBI: 31,
        PopAge: 41.8,
        LegAge: 50.6,
        Under20: 21,
        PopNum: 37.7,
        Income: 'High',
      },
      {
        Country: 'Argentina',
        YWBI: 17,
        PopAge: 32.4,
        LegAge: 57,
        Under20: 32.1,
        PopNum: 45.2,
        Income: 'Upper middle',
      },
      {
        Country: 'Uganda',
        YWBI: 4,
        PopAge: 15.7,
        LegAge: 46.9,
        Under20: 57.1,
        PopNum: 45.7,
        Income: 'Low',
      },
      {
        Country: 'Republic of Korea',
        YWBI: 28,
        PopAge: 43.2,
        LegAge: 54.9,
        Under20: 16.9,
        PopNum: 51.3,
        Income: 'High',
      },
      {
        Country: 'Kenya',
        YWBI: 5,
        PopAge: 20,
        LegAge: 50.7,
        Under20: 49.2,
        PopNum: 53.8,
        Income: 'Lower middle',
      },
      {
        Country: 'South Africa',
        YWBI: 4,
        PopAge: 28,
        LegAge: 59,
        Under20: 36.9,
        PopNum: 59.3,
        Income: 'Upper middle',
      },
      {
        Country: 'Italy',
        YWBI: 27,
        PopAge: 46.5,
        LegAge: 44.3,
        Under20: 17.6,
        PopNum: 60.5,
        Income: 'High',
      },
      {
        Country: 'United Kingdom',
        YWBI: 28,
        PopAge: 40.6,
        LegAge: 51,
        Under20: 23.1,
        PopNum: 67.9,
        Income: 'High',
      },
      {
        Country: 'Germany',
        YWBI: 31,
        PopAge: 47.8,
        LegAge: 47.3,
        Under20: 18.9,
        PopNum: 83.8,
        Income: 'High',
      },
      {
        Country: 'Turkey',
        YWBI: 9,
        PopAge: 32.2,
        LegAge: 52.8,
        Under20: 31.6,
        PopNum: 84.3,
        Income: 'Upper middle',
      },
      {
        Country: 'Vietnam',
        YWBI: 13,
        PopAge: 31.9,
        LegAge: 49.8,
        Under20: 29.8,
        PopNum: 97.3,
        Income: 'Lower middle',
      },
      {
        Country: 'Ethiopia',
        YWBI: 4,
        PopAge: 19.8,
        LegAge: 40.5,
        Under20: 50.7,
        PopNum: 115,
        Income: 'Low',
      },
      {
        Country: 'Japan',
        YWBI: 33,
        PopAge: 48.6,
        LegAge: 55.5,
        Under20: 16.8,
        PopNum: 126.5,
        Income: 'High',
      },
      {
        Country: 'Mexico',
        YWBI: 12,
        PopAge: 29.3,
        LegAge: 48.1,
        Under20: 34.1,
        PopNum: 128.9,
        Income: 'Upper middle',
      },
      {
        Country: 'Bangladesh',
        YWBI: 10,
        PopAge: 27.9,
        LegAge: 59.5,
        Under20: 35.6,
        PopNum: 164.7,
        Income: 'Lower middle',
      },
      {
        Country: 'Nigeria',
        YWBI: 4,
        PopAge: 18.6,
        LegAge: 55.7,
        Under20: 54,
        PopNum: 206.1,
        Income: 'Lower middle',
      },
      {
        Country: 'Pakistan',
        YWBI: 5,
        PopAge: 22,
        LegAge: 52.4,
        Under20: 44.5,
        PopNum: 220.9,
        Income: 'Lower middle',
      },
      {
        Country: 'Indonesia',
        YWBI: 13,
        PopAge: 31.1,
        LegAge: 51.6,
        Under20: 34,
        PopNum: 273.5,
        Income: 'Lower middle',
      },
      {
        Country: 'India',
        YWBI: 10,
        PopAge: 28.7,
        LegAge: 51,
        Under20: 34.8,
        PopNum: 1407.6,
        Income: 'Lower middle',
      },
      {
        Country: 'China',
        YWBI: 25,
        PopAge: 38.4,
        LegAge: 53,
        Under20: 23.3,
        PopNum: 1439.3,
        Income: 'Upper middle',
      },
    ];

    /* App.svelte generated by Svelte v3.49.0 */

    function create_if_block(ctx) {
    	let pointlayer;
    	let t;
    	let label;
    	let current;

    	pointlayer = new PointLayer({
    			props: {
    				x: /*incomeBand*/ ctx[2].column("PopAge"),
    				y: /*incomeBand*/ ctx[2].column("LegAge"),
    				radius: "2.5",
    				fill: "white",
    				fillOpacity: "0.9"
    			}
    		});

    	label = new Label({
    			props: {
    				fill: "#043754",
    				x: /*selectedRow*/ ctx[1].PopAge,
    				y: /*selectedRow*/ ctx[1].LegAge,
    				anchorPoint: "l",
    				rotate: "0.2",
    				fontFamily: "Source Code Pro",
    				fontSize: "15",
    				text: "–" + /*selectedRow*/ ctx[1].Country
    			}
    		});

    	return {
    		c() {
    			create_component(pointlayer.$$.fragment);
    			t = space();
    			create_component(label.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(pointlayer, target, anchor);
    			insert(target, t, anchor);
    			mount_component(label, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const pointlayer_changes = {};
    			if (dirty & /*incomeBand*/ 4) pointlayer_changes.x = /*incomeBand*/ ctx[2].column("PopAge");
    			if (dirty & /*incomeBand*/ 4) pointlayer_changes.y = /*incomeBand*/ ctx[2].column("LegAge");
    			pointlayer.$set(pointlayer_changes);
    			const label_changes = {};
    			if (dirty & /*selectedRow*/ 2) label_changes.x = /*selectedRow*/ ctx[1].PopAge;
    			if (dirty & /*selectedRow*/ 2) label_changes.y = /*selectedRow*/ ctx[1].LegAge;
    			if (dirty & /*selectedRow*/ 2) label_changes.text = "–" + /*selectedRow*/ ctx[1].Country;
    			label.$set(label_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(pointlayer.$$.fragment, local);
    			transition_in(label.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(pointlayer.$$.fragment, local);
    			transition_out(label.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(pointlayer, detaching);
    			if (detaching) detach(t);
    			destroy_component(label, detaching);
    		}
    	};
    }

    // (59:6) <Section         x1={0}         x2={0.9}         y1={0.7}         y2={0}         {padding}         scaleX={[15, 51]}         scaleY={[39, 65]}       >
    function create_default_slot_1(ctx) {
    	let pointlayer;
    	let t0;
    	let t1;
    	let xaxis;
    	let t2;
    	let yaxis;
    	let current;

    	pointlayer = new PointLayer({
    			props: {
    				x: /*plottings*/ ctx[3].column("PopAge"),
    				y: /*plottings*/ ctx[3].column("LegAge"),
    				radius: /*plottings*/ ctx[3].map("Under20", /*areaScale*/ ctx[6]),
    				fill: /*plottings*/ ctx[3].map("YWBI", /*colourScale*/ ctx[5]),
    				opacity: /*func*/ ctx[9],
    				onMouseover: /*selectPoint*/ ctx[7],
    				onMouseout: /*deselectPoint*/ ctx[8]
    			}
    		});

    	let if_block = /*selectedRow*/ ctx[1] !== "" && create_if_block(ctx);

    	xaxis = new XAxis({
    			props: {
    				title: "Average age of population",
    				titleColor: "#95d2f5",
    				titleFontSize: "18",
    				titleFontWeight: "bold",
    				titleVjust: 1.02,
    				tickCount: "18"
    			}
    		});

    	yaxis = new YAxis({
    			props: {
    				title: "Average age of legislators",
    				titleColor: "#95d2f5",
    				titleFontSize: "18",
    				titleFontWeight: "bold",
    				titleHjust: -0.06,
    				tickCount: "12"
    			}
    		});

    	return {
    		c() {
    			create_component(pointlayer.$$.fragment);
    			t0 = space();
    			if (if_block) if_block.c();
    			t1 = space();
    			create_component(xaxis.$$.fragment);
    			t2 = space();
    			create_component(yaxis.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(pointlayer, target, anchor);
    			insert(target, t0, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, t1, anchor);
    			mount_component(xaxis, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(yaxis, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const pointlayer_changes = {};
    			if (dirty & /*selectedIndex*/ 1) pointlayer_changes.opacity = /*func*/ ctx[9];
    			pointlayer.$set(pointlayer_changes);

    			if (/*selectedRow*/ ctx[1] !== "") {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*selectedRow*/ 2) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(t1.parentNode, t1);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(pointlayer.$$.fragment, local);
    			transition_in(if_block);
    			transition_in(xaxis.$$.fragment, local);
    			transition_in(yaxis.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(pointlayer.$$.fragment, local);
    			transition_out(if_block);
    			transition_out(xaxis.$$.fragment, local);
    			transition_out(yaxis.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(pointlayer, detaching);
    			if (detaching) detach(t0);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(t1);
    			destroy_component(xaxis, detaching);
    			if (detaching) detach(t2);
    			destroy_component(yaxis, detaching);
    		}
    	};
    }

    // (58:4) <Graphic width={1000} height={1000}>
    function create_default_slot(ctx) {
    	let section;
    	let current;

    	section = new Section({
    			props: {
    				x1: 0,
    				x2: 0.9,
    				y1: 0.7,
    				y2: 0,
    				padding: /*padding*/ ctx[4],
    				scaleX: [15, 51],
    				scaleY: [39, 65],
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(section.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(section, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const section_changes = {};

    			if (dirty & /*$$scope, selectedRow, incomeBand, selectedIndex*/ 2055) {
    				section_changes.$$scope = { dirty, ctx };
    			}

    			section.$set(section_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(section.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(section.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(section, detaching);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let div3;
    	let div0;
    	let t3;
    	let div1;
    	let graphic;
    	let t4;
    	let div2;
    	let current;

    	graphic = new Graphic({
    			props: {
    				width: 1000,
    				height: 1000,
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			div3 = element("div");
    			div0 = element("div");

    			div0.innerHTML = `<h1 class="svelte-li44gy">Youth Wellbeing in Relation to the Average Age of the Population and the Average Age of National Legislators</h1> 
    <h2 class="svelte-li44gy">A preliminary analysis of 25 countries around the world based on UN and World Bank data.</h2>`;

    			t3 = space();
    			div1 = element("div");
    			create_component(graphic.$$.fragment);
    			t4 = space();
    			div2 = element("div");

    			div2.innerHTML = `<h3 class="svelte-li44gy">Visualization goals and design choices</h3> 
    <p class="svelte-li44gy">This visualization explores the relationship, if any, between the relative youth of a population and its legislature (as proxies for the social and political representation of younger people, ages 0-30) with the general well-being of young people. 
      The visualization is built on a fairly complex table, where each item has 13 attributes. I&#39;ve designed this visualization to provide a big-picture perspective of the data without overwhelming detail. 
      Most of the attributes have been used to construct a colour-coded index to measure this concept of youth well-being introduced here. 
      I&#39;ve used colour hue (red to green) as the channel to indicate the multi-measure index. The index is three-tiered (“survival”, “prospects”, and “futurity&quot;) and the tiers are weighted (1-3) in declining order.
      I&#39;ve used aligned spatial positions to indicate the most important ordered attributes in my dataset, namely the average ages of population and legislature. Less important, &quot;nice to know&quot; data will be indicated by the size of my points (currently at a default size comfortable for hovering) and the thickness of its border line. 
      If the implicit hypothesis of this visualization is that youth representation in politics leads to better policy outcomes for young people, the obvious alternative hypothesis is that youth representation is irrelevant and what matters is a country&#39;s income/development level. I thus include a link to points of similar income levels (World Bank groupings based on per capita GNI).</p>`;

    			attr(div1, "class", "chart");
    			set_style(div1, "width", "60%");
    			set_style(div1, "height", "100%");
    			set_style(div1, "float", "left");
    			set_style(div2, "width", "40%");
    			set_style(div2, "height", "100%");
    			set_style(div2, "float", "right");
    			attr(div3, "class", "graph");
    		},
    		m(target, anchor) {
    			insert(target, div3, anchor);
    			append(div3, div0);
    			append(div3, t3);
    			append(div3, div1);
    			mount_component(graphic, div1, null);
    			append(div3, t4);
    			append(div3, div2);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const graphic_changes = {};

    			if (dirty & /*$$scope, selectedRow, incomeBand, selectedIndex*/ 2055) {
    				graphic_changes.$$scope = { dirty, ctx };
    			}

    			graphic.$set(graphic_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(graphic.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(graphic.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div3);
    			destroy_component(graphic);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	const plottings = new DataContainer(data);
    	const padding = { left: 60, bottom: 10, top: 10, right: 10 };
    	let colourScale = linear().domain([0, 36]).range(["rgb(255, 0, 0)", "rgb(0, 255, 127)"]);
    	ordinal().domain(["Low", "Lower middle", "Upper middle", "High"]).range(['#f7f7f7', '#cccccc', '#969696', '#525252']);
    	let areaScale = linear().domain(plottings.domain("Under20")).range([5, 12]);

    	// Point selection
    	let selectedIndex = "";

    	let selectedRow = "";
    	let incomeBand = "";

    	function selectPoint(event) {
    		$$invalidate(0, selectedIndex = event.index);
    		$$invalidate(1, selectedRow = plottings.row({ index: selectedIndex }));
    		$$invalidate(2, incomeBand = plottings.filter(row => row.Income == selectedRow.Income));
    	}

    	function deselectPoint() {
    		$$invalidate(0, selectedIndex = "");
    		$$invalidate(1, selectedRow = "");
    	}

    	const func = event => event.index === selectedIndex ? 1 : 0.7;

    	return [
    		selectedIndex,
    		selectedRow,
    		incomeBand,
    		plottings,
    		padding,
    		colourScale,
    		areaScale,
    		selectPoint,
    		deselectPoint,
    		func
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    const app = new App({
      target: document.body
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
