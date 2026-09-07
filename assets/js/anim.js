/* ==========================================================================
   anim.js — the site's animation system.

   Four primitives, requested by the markup through data-anim attributes rather
   than matched on class names, so behaviour stays consistent across all 21 pages
   and restyling a component cannot switch its animation off:

     lines    split a heading into lines, clip them, rise each one in turn
     fade     subtle rise + fade, no splitting
     reveal   fade with a slight scale, for images and media
     stagger  a container whose items enter in sequence (mark items data-anim="item")

   Two more attributes carry the hero, which runs on load instead of on scroll:
   data-anim-hero on the box whose children animate, and data-anim-layer on each
   layer of the hero visual.

   Nothing is hidden unless this file confirms GSAP is present, so a CDN
   failure leaves the page fully readable rather than blank.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var g = window.gsap;
  var ST = window.ScrollTrigger;
  var Split = window.SplitText;
  var Smoother = window.ScrollSmoother;

  /* `js-anim` is set inline in <head> before paint and pre-hides the targets.
     Removing it is the escape hatch: content renders as normal, unanimated.

     The head script owns that hatch now, because it is the only one guaranteed
     to run -- this file is deferred behind GSAP on a CDN and may be late or
     absent. Delegate to it so `down` stays truthful; fall back to the direct
     removal on any page whose head predates the watchdog. */
  function standDown() {
    if (window.__anim) { window.__anim.standDown(); return; }
    root.classList.remove('js-anim');
  }

  /* Did the watchdog reveal the hero before GSAP arrived? Then the entrance is
     forfeit: setting its start state now would blink content the visitor can
     already see back to nothing. Read once, here, so a watchdog firing midway
     through setup cannot make presetHero and initHero disagree.

     Scroll animations are unaffected either way -- they were never pre-hidden
     by CSS, so GSAP setting their start state is the same work it always did. */
  var heroForfeit = !!(window.__anim && window.__anim.down);

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!g || reduce) {
    standDown();
    return;
  }

  if (ST) g.registerPlugin(ST);
  if (Split) g.registerPlugin(Split);
  if (Smoother) g.registerPlugin(Smoother);

  /* Mobile gets shorter travel, quicker timing and no line splitting — the
     split is the expensive part and it reflows on every rotation. */
  var mobile = window.matchMedia('(max-width: 767px)').matches;
  var D = mobile
    ? { y: 14, dur: 0.5, stagger: 0.05, ease: 'power2.out' }
    : { y: 28, dur: 0.8, stagger: 0.08, ease: 'power3.out' };

  /* The markup declares its own behaviour, so nothing here depends on a class
     name. Restyling or renaming a component cannot silently switch off its
     animation, which is exactly how the CSS pre-hide and this file drifted apart
     and left 13 pages with permanently invisible hero content.

       data-anim="lines"    heading — split and rise line by line
       data-anim="fade"     single block — rise and fade
       data-anim="reveal"   media — fade with a slight scale
       data-anim="stagger"  container — its items enter in sequence
       data-anim="item"     one unit inside a stagger container
       data-anim-hero       container whose children animate on load
       data-anim-layer      hero visual layer (plate|aura|frame|image|chip)
       data-anim-thread     timeline line whose fill is drawn on scroll  */
  var SEL = {
    lines: '[data-anim="lines"]',
    fade: '[data-anim="fade"]',
    reveal: '[data-anim="reveal"]',
    stagger: '[data-anim="stagger"]',
    item: '[data-anim="item"]',
    hero: '[data-anim-hero]',
    layer: '[data-anim-layer]'
  };

  function layer(name, root) {
    return (root || document).querySelector('[data-anim-layer="' + name + '"]');
  }

  /* The hero box is the CSS pre-hide hook too, so both sides read one attribute. */
  function heroBox() {
    return document.querySelector(SEL.hero);
  }

  function heroRoot() {
    var box = heroBox();
    return box ? (box.closest('section') || box.parentElement) : null;
  }

  var pick = function (kind) {
    var hero = heroRoot();
    return g.utils.toArray(SEL[kind]).filter(function (el) {
      /* hero animates on load, not on scroll — except headings, which split */
      if (hero && hero.contains(el)) return kind === 'lines';
      /* anything inside a stagger group already moves with that group */
      if (el.closest(SEL.stagger)) return false;
      return true;
    });
  };

  /* ---- lines ---------------------------------------------------------- */
  /* SplitText is free from GSAP 3.13. `mask: "lines"` builds the overflow
     wrapper for us, which is the whole trick behind a clipped line reveal.
     The split is reverted once the animation finishes, so the DOM goes back
     to plain text and resizing has nothing left to break. */
  function splitInto(el) {
    if (!Split || mobile) return null;
    if (document.fonts && !document.fonts.check('800 1em "Plus Jakarta Sans"')) {
      return null;
    }
    try {
      return new Split(el, { type: 'lines', mask: 'lines', linesClass: 'anim-line' });
    } catch (e) {
      return null;
    }
  }

  function animateLines(el) {
    var split = splitInto(el);
    var targets = split && split.lines.length ? split.lines : [el];
    var clipped = !!(split && split.lines.length);

    g.set(el, { opacity: 1 });
    g.set(targets, clipped ? { yPercent: 115 } : { opacity: 0, y: D.y });

    /* Returns the tween's ingredients rather than a running tween. g.to() starts
       immediately, so adding one to a timeline afterwards ignored its position
       and swallowed its callbacks — which left the split un-reverted. */
    var vars = clipped
      ? { yPercent: 0, duration: 0.9, stagger: 0.09, ease: 'power4.out' }
      : { opacity: 1, y: 0, duration: D.dur, stagger: D.stagger, ease: D.ease };
    vars.overwrite = true;
    vars.onComplete = function () {
      if (split) split.revert();           /* hand the clean markup back */
    };

    return { targets: targets, vars: vars };
  }

  /* ---- smooth scroll -----------------------------------------------------
     #smooth-wrapper/#smooth-content wrap <main> and <footer> in every page
     (assets/js sits alongside the markup that makes this work). The header,
     skip-link and WhatsApp button stay outside that pair deliberately —
     ScrollSmoother puts a CSS transform on #smooth-content, and a transformed
     ancestor turns any position:fixed descendant into one fixed to *it*
     instead of the viewport, so a fixed header inside would scroll away. */
  function initSmooth() {
    if (!Smoother || !document.getElementById('smooth-wrapper')) return;
    Smoother.create({
      wrapper: '#smooth-wrapper',
      content: '#smooth-content',
      smooth: 1.2,
      effects: false,
      normalizeScroll: true
    });
    window.addEventListener('load', function () {
      if (ST) ST.refresh();
    });
  }

  /* ---- scroll-triggered ------------------------------------------------ */
  function onEnterOnce(trigger, run) {
    ST.create({ trigger: trigger, start: 'top 85%', once: true, onEnter: run });
  }

  function initScroll() {
    if (!ST) return;

    pick('lines').forEach(function (el) {
      var hero = heroRoot();
      if (hero && hero.contains(el)) return;        /* hero runs on load instead */
      var a = animateLines(el);
      onEnterOnce(el, function () { g.to(a.targets, a.vars); });
    });

    var fades = pick('fade');
    if (fades.length) {
      g.set(fades, { opacity: 0, y: D.y });
      ST.batch(fades, {
        start: 'top 88%', once: true,
        onEnter: function (b) {
          g.to(b, { opacity: 1, y: 0, duration: D.dur, stagger: D.stagger,
                    ease: D.ease, overwrite: true });
        }
      });
    }

    var reveals = pick('reveal');
    if (reveals.length) {
      g.set(reveals, { opacity: 0, scale: 0.98 });
      ST.batch(reveals, {
        start: 'top 88%', once: true,
        onEnter: function (b) {
          g.to(b, { opacity: 1, scale: 1, duration: 0.9, stagger: 0.1,
                    ease: 'power3.out', overwrite: true });
        }
      });
    }

    /* One batch per container, so siblings stagger against each other rather
       than every card on the page sharing one sequence. Marking the item as
       well as the container keeps the unit the card itself — grouping on the
       container's children alone would animate whatever column wrapper the
       grid happens to put around it. */
    g.utils.toArray(SEL.stagger).forEach(function (box) {
      var els = g.utils.toArray(box.querySelectorAll(SEL.item)).filter(function (el) {
        return el.closest(SEL.stagger) === box;      /* skip nested groups */
      });
      if (!els.length) els = g.utils.toArray(box.children);
      if (!els.length) return;
      g.set(els, { opacity: 0, y: D.y });
      ST.batch(els, {
        start: 'top 88%', once: true,
        onEnter: function (b) {
          g.to(b, { opacity: 1, y: 0, duration: D.dur, stagger: D.stagger,
                    ease: D.ease, overwrite: true });
        }
      });
    });
  }


  /* ---- scroll thread ----------------------------------------------------
     The About page timeline draws its centre line as the section passes: the
     fill scrubs from the top of the list to the bottom and the drop rides its
     leading edge. Scrubbed rather than triggered once, so the line tracks the
     scrollbar in both directions instead of playing through and finishing
     while half the entries are still below the fold.

     Height, not scaleY: the drop is a child of the fill, and a scaled parent
     would squash it. Two pixels of layout per frame costs nothing.

     Like every other primitive here it is requested by attribute, so restyling
     the timeline cannot quietly switch it off. */
  function initThread() {
    if (!ST) return;
    g.utils.toArray('[data-anim-thread]').forEach(function (line) {
      var fill = line.querySelector('[data-anim-thread-fill]');
      /* Below lg the line is display:none and has no height to draw. */
      if (!fill || !line.offsetParent) return;
      g.fromTo(
        fill,
        { height: '0%' },
        {
          height: '100%',
          ease: 'none',
          scrollTrigger: {
            trigger: line,
            start: 'top 75%',
            end: 'bottom 65%',
            scrub: 0.6
          }
        }
      );
    });
  }


  /* ---- hero visual ------------------------------------------------------
     Four layers assembled back to front rather than sliding in as one block.
     The portrait wipes via clip-path instead of fading: an element at zero
     opacity is not eligible for LCP, a clipped one still paints.
     .portrait-aura and .portrait-plate are centred with translateX(-50%) in
     CSS, so every tween on them carries xPercent:-50 or GSAP's transform
     would drop the centring. */
  var chipFloats = [];

  function heroVisual(tl, at) {
    var visual = document.querySelector('[data-anim-visual]');
    if (!visual) return;

    var plate = layer('plate', visual);
    var aura = layer('aura', visual);
    var frame = layer('frame', visual);
    var img = layer('image', visual);
    var chips = g.utils.toArray(visual.querySelectorAll('[data-anim-layer="chip"]'));

    if (plate) {
      g.set(plate, { xPercent: -50, scale: 0.92, opacity: 0 });
      tl.to(plate, { xPercent: -50, scale: 1, opacity: 1, duration: 0.7 }, at);
    }
    if (aura) {
      g.set(aura, { xPercent: -50, scale: 0.8, opacity: 0 });
      tl.to(aura, { xPercent: -50, scale: 1, opacity: 0.5, duration: 0.9 }, at + 0.1);
    }
    /* The frame is the mask — it stays put and clips, so the image can slide up
       from below inside it. Fading the frame would hide the image with it, and
       the portrait is a likely LCP element. */
    if (frame) {
      g.set(frame, { opacity: 0 });
      tl.to(frame, { opacity: 1, duration: 0.4, ease: 'none' }, at + 0.15);
    }
    if (img) {
      g.set(img, { yPercent: 100 });
      tl.to(img, { yPercent: 0, duration: 1.1, ease: 'power3.out' }, at + 0.15);
    }
    if (chips.length) {
      g.set(chips, { opacity: 0, scale: 0.9, y: 10 });
      tl.to(chips, {
        opacity: 1, scale: 1, y: 0, duration: 0.5,
        stagger: mobile ? 0 : 0.1, ease: 'back.out(1.6)',
        onComplete: startChipFloat
      }, at + (mobile ? 0.3 : 0.55));
    }
  }

  /* The float used to be an infinite CSS keyframe, which fought any transform
     GSAP applied and ran forever even when scrolled past. Now it is GSAP's,
     starts only once the entrance has landed, and pauses off-screen. */
  function startChipFloat() {
    if (mobile || chipFloats.length) return;
    g.utils.toArray('[data-anim-visual] [data-anim-layer="chip"]').forEach(function (chip, i) {
      chipFloats.push(g.to(chip, {
        y: -14, duration: 3.2 + i * 0.5, ease: 'sine.inOut',
        repeat: -1, yoyo: true
      }));
    });

    var visual = document.querySelector('[data-anim-visual]');
    if (!ST || !visual) return;
    ST.create({
      trigger: visual, start: 'top bottom', end: 'bottom top',
      onToggle: function (self) {
        chipFloats.forEach(function (f) { self.isActive ? f.play() : f.pause(); });
      }
    });
  }

  /* Transform-based start states have to land before first paint. CSS covers the
     opacity ones via .js-anim, but it cannot express yPercent/scale without
     fighting the inline transform GSAP writes later — so they are set here, on
     this script's own tick, rather than waiting for fonts. */
  /* The set to animate is derived from the same rule the CSS pre-hide uses —
     every direct child — rather than a list of class names. A fixed list has to
     be kept in sync with the markup by hand, and silently stranded whatever it
     did not name (.post-meta, .case-meta, the contact form) at opacity 0 with
     nothing left to animate it back. */
  function heroBits(title) {
    var box = heroBox();
    if (!box) return [];
    return g.utils.toArray(box.children).filter(function (el) {
      /* the heading animates as split lines, not as a block */
      return el !== title && !(title && el.contains(title));
    });
  }

  function heroTitle() {
    var box = heroBox();
    return box ? box.querySelector(SEL.lines) || box.querySelector('h1') : null;
  }

  function presetHero() {
    if (heroForfeit) return;
    var hero = heroRoot();
    if (!hero) return;
    var img = layer('image', hero);
    var plate = layer('plate', hero);
    var aura = layer('aura', hero);
    var chips = g.utils.toArray(hero.querySelectorAll('[data-anim-layer="chip"]'));
    var bits = heroBits(heroTitle());
    var frame = layer('frame', hero);
    if (frame) g.set(frame, { opacity: 0 });
    if (img) g.set(img, { yPercent: 100 });
    if (plate) g.set(plate, { xPercent: -50, scale: 0.92, opacity: 0 });
    if (aura) g.set(aura, { xPercent: -50, scale: 0.8, opacity: 0 });
    if (chips.length) g.set(chips, { opacity: 0, scale: 0.9, y: 10 });
    if (bits.length) g.set(bits, { opacity: 0, y: D.y });
  }

  /* ---- hero, on load --------------------------------------------------- */
  function initHero() {
    if (heroForfeit) return null;
    var hero = heroRoot();
    if (!hero) return null;

    var title = heroTitle();
    var bits = heroBits(title);

    if (bits.length) g.set(bits, { opacity: 0, y: D.y });

    var lines = title ? animateLines(title) : null;
    var tl = g.timeline({ defaults: { ease: D.ease } });

    /* bits is already in document order, so the title's index splits it. */
    var cut = title ? bits.findIndex(function (b) {
      return b.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_PRECEDING;
    }) : -1;
    if (cut === -1) cut = bits.length;
    var above = bits.slice(0, cut);
    var below = bits.slice(cut);

    /* Absolute positions, not '-=', so the sequence cannot drift with the
       timeline's computed duration. */
    if (above.length) tl.to(above, { opacity: 1, y: 0, duration: D.dur, stagger: D.stagger }, 0);
    if (lines) tl.to(lines.targets, lines.vars, 0.15);
    if (below.length) tl.to(below, { opacity: 1, y: 0, duration: D.dur, stagger: D.stagger }, 0.5);

    heroVisual(tl, 0.15);
    return tl;
  }

  /* ---- go --------------------------------------------------------------
     Initial states are set immediately, on the deferred script's own tick, so
     nothing is ever painted in its final position and then yanked back. Only
     playback waits for fonts, because line boxes depend on them. */
  var heroPlayed = false;

  function start() {
    initSmooth();
    var heroTl = initHero();
    heroPlayed = true;
    initScroll();
    initThread();

    /* Last line of defence. If a selector stops matching — a class rename, a
       markup change — the pre-hide would otherwise leave the hero permanently
       invisible. Anything still at zero opacity once the sequence is over gets
       shown.

       The window is measured from the timeline rather than fixed at 1.5s. A net
       that fires mid-sequence reads a tween that has not started yet as a
       stranded element, forces it visible and tears the whole system down --
       which is a live risk the moment any hero beat is scheduled past 1.5s. */
    var net = Math.max(1500, heroTl ? (heroTl.duration() + 0.4) * 1000 : 0);
    setTimeout(function () {
      /* No early return on "the portrait looks fine": the 20 pages without a
         portrait took that branch and skipped the check entirely, which is
         exactly where a stranded element would go unnoticed. */
      if (!heroPlayed) return;
      var stuck = g.utils.toArray(
        '[data-anim-hero] > *, [data-anim-layer]'
      ).filter(function (el) { return +getComputedStyle(el).opacity === 0; });
      var img = layer('image');
      var parked = img && Math.abs(g.getProperty(img, 'yPercent')) > 1;
      if (stuck.length || parked) {
        if (stuck.length) g.set(stuck, { opacity: 1, y: 0, clearProps: 'transform' });
        if (parked) g.set(img, { yPercent: 0 });
        standDown();
      }
    }, net);

    /* Line boxes are measured, so a width change invalidates any split still
       waiting to run. Completed ones already reverted themselves. */
    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { if (ST) ST.refresh(); }, 200);
    });
  }

  presetHero();

  /* Line splitting needs the heading font's metrics — but document.fonts.ready
     waits for every font on the page, including the icon set, which has nothing
     to do with line boxes. That held the hero heading invisible for ~2.3s.
     Wait for just the heading face, and cap it: a slow font must not keep the
     headline hidden. */
  var fontReady;
  if (document.fonts && document.fonts.load) {
    fontReady = Promise.race([
      document.fonts.load('800 3rem "Plus Jakarta Sans"'),
      new Promise(function (resolve) { setTimeout(resolve, 400); })
    ]);
  } else {
    fontReady = Promise.resolve();
  }
  fontReady.then(start).catch(start);
})();
