/* ashekur.com — vanilla JS: mobile nav, scroll state, reveals, stat counters, form */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Nav dropdowns ----
     CSS already opens the desktop panel on hover and focus; this adds the click
     toggle that touch and keyboard users need, and drives the mobile accordion,
     which has no hover to lean on. */
  var dropdowns = [].slice.call(document.querySelectorAll('[data-dropdown]'));

  var closeDropdowns = function (except) {
    dropdowns.forEach(function (d) {
      if (d === except) return;
      d.classList.remove('is-open');
      var t = d.querySelector('[data-dropdown-toggle]');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  };

  dropdowns.forEach(function (d) {
    var toggle = d.querySelector('[data-dropdown-toggle]');
    if (!toggle) return;
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = !d.classList.contains('is-open');
      closeDropdowns(d);
      d.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
  });

  /* ---- Services mega-menu: align it to the page container ----
     #navDrop-services only — the mobile accordion is full-width and
     in-flow, never position:absolute, so it has no overflow case to guard
     against. The panel can become visible via CSS :hover/:focus-within with
     no JS event at all, so this listens on the trigger item itself
     (mouseenter/focusin fire on every open path, hover included) rather
     than only the click toggle already wired up above.

     The panel's containing block is .nav-item (only as wide as the
     "Services" link + caret, ~130px), so no CSS percentage/vw offset can
     land it flush with the site's actual .container edges — only reading
     that container's live rect can. This is the panel's real default:
     width and left are set from the header's own .container every time it
     opens, so it always starts and ends at the same horizontal boundaries
     as the page's main content column, at whatever width that container
     currently measures. The 15px viewport nudge afterwards is a safety
     fallback only — aligning to the real container already keeps the
     panel on-screen, so this should rarely fire, but it stays as a guard
     for edge cases (zoom, scrollbar width) the rect math might still miss:
       - overflows the right edge → drop the left offset and pin the panel
         15px from the right instead.
       - overflows the left edge (or lands closer than 15px to it) → set
         an absolute left offset, computed from the item's own position,
         that puts the panel's left edge exactly 15px from the viewport's
         left edge. */
  var servicesPanel = document.getElementById('navDrop-services');
  var servicesItem = servicesPanel ? servicesPanel.closest('[data-dropdown]') : null;
  var siteContainer = document.querySelector('.site-header .container');

  if (servicesItem) {
    var repositionServicesPanel = function () {
      servicesPanel.style.left = '';
      servicesPanel.style.right = '';
      servicesPanel.style.width = '';

      var itemRect = servicesItem.getBoundingClientRect();

      if (siteContainer) {
        var containerRect = siteContainer.getBoundingClientRect();
        servicesPanel.style.width = containerRect.width + 'px';
        servicesPanel.style.left = (containerRect.left - itemRect.left) + 'px';
      }

      var panelRect = servicesPanel.getBoundingClientRect();
      var viewportWidth = document.documentElement.clientWidth;

      if (panelRect.right > viewportWidth) {
        servicesPanel.style.left = 'auto';
        servicesPanel.style.right = '15px';
      } else if (panelRect.left < 15) {
        servicesPanel.style.left = (15 - itemRect.left) + 'px';
      }
    };

    servicesItem.addEventListener('mouseenter', repositionServicesPanel);
    servicesItem.addEventListener('focusin', repositionServicesPanel);
    var servicesToggle = servicesItem.querySelector('[data-dropdown-toggle]');
    if (servicesToggle) servicesToggle.addEventListener('click', repositionServicesPanel);
    window.addEventListener('resize', repositionServicesPanel);
  }

  if (dropdowns.length) {
    document.addEventListener('click', function (e) {
      if (!e.target.closest('[data-dropdown]')) closeDropdowns(null);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDropdowns(null);
    });
  }

  /* ---- Mobile navigation ---- */
  var burger = document.getElementById('burger');
  var mobileNav = document.getElementById('mobileNav');

  if (burger && mobileNav) {
    var menuScrollY = 0;
    var setMenu = function (open) {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      mobileNav.hidden = !open;
      if (!open) closeDropdowns(null);

      /* Plain `body { overflow: hidden }` doesn't actually block touch
         scroll on iOS Safari, which is why the menu's own scroll was still
         chaining into the page underneath. Freezing the body in place with
         position:fixed at its current offset is the fix that holds on iOS
         too; GSAP (already loaded site-wide) applies/clears it since it's
         on hand and handles the property batch in one call. */
      if (open) {
        menuScrollY = window.scrollY || window.pageYOffset;
        window.gsap.set(document.body, { position: 'fixed', top: -menuScrollY, left: 0, right: 0, overflow: 'hidden' });
      } else {
        window.gsap.set(document.body, { clearProps: 'position,top,left,right,overflow' });
        window.scrollTo(0, menuScrollY);
      }
    };
    burger.addEventListener('click', function () {
      setMenu(burger.getAttribute('aria-expanded') !== 'true');
    });
    mobileNav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        burger.focus();
      }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 992) setMenu(false);
    });
  }

    /* ---- Testimonial slider ----
     Scroll-snap does the sliding; this only wires the buttons and dots to it and
     keeps their state in sync when the user swipes or scrolls directly. */
  var slider = document.querySelector('[data-slider]');
  if (slider) {
    var track = slider.querySelector('[data-track]');
    var dotsBox = slider.querySelector('[data-dots]');
    var prev = slider.querySelector('[data-prev]');
    var next = slider.querySelector('[data-next]');
    var items = track ? track.querySelectorAll('.t-item') : [];

    if (track && items.length) {
      var step = function () {
        var a = items[0].getBoundingClientRect();
        var b = items[1] ? items[1].getBoundingClientRect() : null;
        return b ? b.left - a.left : a.width;
      };
      var index = function () {
        return Math.round(track.scrollLeft / step());
      };
      var pages = function () {
        /* distinct scroll positions = items - visible + 1. Deriving this from the
           item count is exact; measuring scrollWidth picks up the track's padding
           and rounds to one position too many. */
        var visible = Math.max(1, Math.round(track.clientWidth / step()));
        return Math.max(1, items.length - visible + 1);
      };

      /* dots */
      var renderDots = function () {
        if (!dotsBox) return;
        dotsBox.innerHTML = '';
        for (var i = 0; i < pages(); i++) {
          var b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('aria-label', 'Go to testimonial ' + (i + 1));
          b.dataset.to = i;
          dotsBox.appendChild(b);
        }
      };
      var sync = function () {
        var i = index();
        var last = pages() - 1;
        if (dotsBox) {
          Array.prototype.forEach.call(dotsBox.children, function (d, n) {
            d.setAttribute('aria-current', String(n === i));
          });
        }
        if (prev) prev.disabled = i <= 0;
        if (next) next.disabled = i >= last;
      };

      renderDots();
      sync();

      if (prev) prev.addEventListener('click', function () { track.scrollBy({ left: -step() }); });
      if (next) next.addEventListener('click', function () { track.scrollBy({ left: step() }); });
      if (dotsBox) dotsBox.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (b) track.scrollTo({ left: step() * Number(b.dataset.to) });
      });

      var raf;
      track.addEventListener('scroll', function () {
        if (raf) return;
        raf = requestAnimationFrame(function () { raf = null; sync(); });
      }, { passive: true });

      /* Drag to scroll. Touch already scrolls natively and does it better, so only
         mouse and pen are handled here. Snap is switched off mid-drag because it
         fights the pointer, then re-applied so the track settles on an item. */
      var dragging = false, startX = 0, startLeft = 0, moved = 0;

      track.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch' || e.button !== 0) return;
        dragging = true;
        moved = 0;
        startX = e.clientX;
        startLeft = track.scrollLeft;
        track.classList.add('is-dragging');
        track.style.scrollSnapType = 'none';
        track.style.scrollBehavior = 'auto';
        track.setPointerCapture(e.pointerId);
      });

      track.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - startX;
        if (Math.abs(dx) > moved) moved = Math.abs(dx);
        track.scrollLeft = startLeft - dx;
      });

      var endDrag = function (e) {
        if (!dragging) return;
        dragging = false;
        track.classList.remove('is-dragging');
        track.style.scrollSnapType = '';
        track.style.scrollBehavior = '';
        if (e && e.pointerId != null && track.hasPointerCapture(e.pointerId)) {
          track.releasePointerCapture(e.pointerId);
        }
        var s = step();
        track.scrollTo({ left: Math.round(track.scrollLeft / s) * s, behavior: 'smooth' });
      };

      track.addEventListener('pointerup', endDrag);
      track.addEventListener('pointercancel', endDrag);

      /* A drag that ends over a link must not also trigger it. */
      track.addEventListener('click', function (e) {
        if (moved > 6) {
          e.preventDefault();
          e.stopPropagation();
        }
      }, true);

      /* Native image/text dragging would hijack the gesture. */
      track.addEventListener('dragstart', function (e) { e.preventDefault(); });

      window.addEventListener('resize', function () { renderDots(); sync(); });
      /* Fonts and late CSS can change item widths after DOMContentLoaded, so
         remeasure once the page has fully loaded. */
      window.addEventListener('load', function () { renderDots(); sync(); });
    }
  }

  /* ---- Video popup ----
     A native <dialog>, so focus trapping, Escape and the top layer come from the
     browser. GSAP only handles the transition. The iframe is created on open and
     destroyed on close, which is what actually stops playback.

     TODO / UNUSED (audited 2026-08-27): nothing on any page currently opens this.
     The opener is delegated from a [data-video] attribute, and no page carries
     one -- so this block, the #videoPopup dialog in index.html, the .vp-* rules
     in template.css and the i.ytimg.com preconnect are all currently dead
     weight. Kept deliberately, not overlooked.

     Two ways to settle it, and please pick one rather than half-doing it:
       - to bring it back, add data-video with a YouTube href to a trigger and
         the delegation below picks it up with no other change;
       - to remove it, all four pieces named above go together.
     Do not delete the JS on its own: the markup and CSS would be left orphaned
     with nothing pointing at them, which is how this became hard to spot. */
  var vp = document.getElementById('videoPopup');
  if (vp) {
    var vpFrame = vp.querySelector('.vp-frame');
    var vpPanel = vp.querySelector('.vp-panel');
    var vpClose = vp.querySelector('.vp-close');
    var lastFocus = null;
    var g = window.gsap;

    var videoId = function (href) {
      var m = href.match(/[?&]v=([\w-]{6,})/) ||
              href.match(/youtu\.be\/([\w-]{6,})/) ||
              href.match(/\/embed\/([\w-]{6,})/);
      return m ? m[1] : null;
    };

    var openVideo = function (id, label) {
      lastFocus = document.activeElement;
      vpFrame.innerHTML =
        '<iframe src="https://www.youtube-nocookie.com/embed/' + id +
        '?autoplay=1&rel=0" title="' + (label || 'Video') + '" allow="autoplay; ' +
        'encrypted-media; picture-in-picture" allowfullscreen ' +
        'referrerpolicy="strict-origin-when-cross-origin"></iframe>';
      vp.showModal();
      document.body.style.overflow = 'hidden';
      if (g && !reduceMotion) {
        /* Kill anything still running, or a close fired mid-open leaves two tweens
           fighting over opacity and neither completes. */
        g.killTweensOf([vp, vpPanel]);
        g.fromTo(vp, { opacity: 0 },
                 { opacity: 1, duration: 0.25, ease: 'power2.out', overwrite: true });
        g.fromTo(vpPanel, { scale: 0.92, y: 26 },
                 { scale: 1, y: 0, duration: 0.5, ease: 'power3.out', overwrite: true });
      }
      vpClose.focus();
    };

    var closeVideo = function () {
      if (!vp.open) return;
      var done = false;
      var finish = function () {
        if (done) return;
        done = true;
        if (g) g.killTweensOf([vp, vpPanel]);
        vp.style.opacity = '';
        vp.close();
        vpFrame.innerHTML = '';          /* removing the iframe stops the audio */
        document.body.style.overflow = '';
        if (lastFocus) lastFocus.focus();
      };
      if (g && !reduceMotion) {
        g.killTweensOf([vp, vpPanel]);
        g.to(vpPanel, { scale: 0.95, y: 14, duration: 0.18, ease: 'power2.in',
                        overwrite: true });
        g.to(vp, { opacity: 0, duration: 0.2, ease: 'power2.in', overwrite: true,
                   onComplete: finish });
        /* GSAP drives onComplete off requestAnimationFrame, which is throttled in
           background tabs and can stall. Without this the dialog could never be
           closed. setTimeout is not rAF-bound, so it always lands. */
        setTimeout(finish, 400);
      } else {
        finish();
      }
    };

    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-video]');
      if (trigger) {
        var id = videoId(trigger.getAttribute('href') || '');
        if (id) {
          e.preventDefault();
          openVideo(id, trigger.getAttribute('aria-label'));
        }
        return;
      }
      /* click on the backdrop, i.e. the dialog itself rather than the panel */
      if (e.target === vp) closeVideo();
    });

    vpClose.addEventListener('click', closeVideo);

    /* Escape fires `cancel`; take it over so the close animates */
    vp.addEventListener('cancel', function (e) {
      e.preventDefault();
      closeVideo();
    });
  }

  /* ---- Header scroll state ---- */
  var header = document.getElementById('siteHeader');
  var ticking = false;
  var lastScrollY = 0;

  function onScroll() {
    if (!header) return;
    var y = window.pageYOffset;
    var scrollingDown = y > lastScrollY && y > 80;
    var scrollingUp = y < lastScrollY;

    header.classList.toggle('is-scrolled', y > 20);
    header.classList.toggle('is-hidden', scrollingDown);
    header.classList.toggle('is-up', scrollingUp && y > 20);

    if (y <= 20) {
      header.classList.remove('is-hidden', 'is-up');
    }

    lastScrollY = y;
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  /* ---- Stat counters ---- */
  var stats = document.querySelectorAll('.stat-num[data-count]');
  function countUp(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    var suffix = el.getAttribute('data-suffix') || '';
    if (reduceMotion || isNaN(target)) { el.textContent = target + suffix; return; }
    var start = performance.now();
    var dur = 1100;
    function step(now) {
      var p = Math.min((now - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ('IntersectionObserver' in window) {
    var statObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        countUp(entry.target);
        statObserver.unobserve(entry.target);
      });
    }, { threshold: 0.5 });
    Array.prototype.forEach.call(stats, function (el) { statObserver.observe(el); });
  }

  /* ---- Active nav link ---- */
  var sections = document.querySelectorAll('main section[id]');
  var navLinks = document.querySelectorAll('.nav-link');
  if ('IntersectionObserver' in window && navLinks.length) {
    var navObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        Array.prototype.forEach.call(navLinks, function (link) {
          link.classList.toggle('is-active', link.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Array.prototype.forEach.call(sections, function (s) { navObserver.observe(s); });
  }

  /* ---- Contact form (validation + Google Sheets via Apps Script) ---- */
  var form = document.getElementById('contactForm');
  var note = document.getElementById('formNote');
  if (!form || !note) return;
  var submitBtn = form.querySelector('button[type="submit"]');
  /* Whatever this button says is what it goes back to saying. */
  var submitLabel = submitBtn ? submitBtn.textContent : '';
  /* Bots fill hidden fields; people do not. Named to avoid matching a browser
     autofill category (name="website" was getting silently autofilled by real
     visitors' browsers, which dropped their submissions -- diagnosed 2026-09-01). */
  var honeypot = form.querySelector('[name="hp_confirm"]');

  /* Budget "Custom amount" option reveals a $-prefixed number field. Not
     given a name attribute, so the generic payload loop below ignores it --
     its value is folded into payload.budget instead, since the backend
     (contact-handler.php) only reads a single "budget" key. */
  var budgetSelect = form.querySelector('#budgetSelect');
  var budgetCustomField = document.getElementById('budgetCustomField');
  var budgetCustomInput = document.getElementById('budgetCustomAmount');
  if (budgetSelect && budgetCustomField && budgetCustomInput) {
    budgetSelect.addEventListener('change', function () {
      var isCustom = budgetSelect.value === 'Custom amount';
      budgetCustomField.hidden = !isCustom;
      budgetCustomInput.required = isCustom;
      if (!isCustom) budgetCustomInput.value = '';
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var fields = form.querySelectorAll('input, textarea, select');
    var firstInvalid = null;

    Array.prototype.forEach.call(fields, function (field) {
      var ok = field.checkValidity();
      field.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (!ok && !firstInvalid) firstInvalid = field;
    });

    note.classList.remove('is-ok', 'is-error');
    if (firstInvalid) {
      note.textContent = 'Please complete the highlighted fields.';
      note.classList.add('is-error');
      firstInvalid.focus();
      return;
    }

    var endpoint = form.getAttribute('data-endpoint') || '';
    if (!endpoint) {
      note.textContent = 'This form has no endpoint configured.';
      note.classList.add('is-error');
      return;
    }

    /* Silently accept and discard: a bot that sees an error just tries again. */
    if (honeypot && honeypot.value !== '') {
      note.textContent = 'Thanks \u2014 your message was sent successfully.';
      note.classList.add('is-ok');
      form.reset();
      return;
    }

    var payload = {};
    Array.prototype.forEach.call(fields, function (field) {
      if (!field.name || field === honeypot) return;
      payload[field.name] = field.value.trim();
    });

    if (budgetSelect && budgetSelect.value === 'Custom amount' && budgetCustomInput) {
      var customAmount = Number(budgetCustomInput.value);
      if (customAmount > 0) {
        payload.budget = '$' + customAmount.toLocaleString('en-US') + ' (custom)';
      }
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
    }
    note.textContent = 'Sending your message...';

    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8'
      },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.json().catch(function () {
        return {};
      }).then(function (result) {
        if (!response.ok || result.status !== 'ok') {
          throw new Error(result.message || 'Request failed');
        }
      });
    }).then(function () {
      note.textContent = 'Thanks — your message was sent successfully.';
      note.classList.add('is-ok');
      form.reset();
    }).catch(function () {
      note.textContent = 'Something went wrong while sending. Please email hello@ashekur.com instead.';
      note.classList.add('is-error');
    }).then(function () {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
      }
    });
  });

  form.addEventListener('input', function (e) {
    if (e.target.getAttribute('aria-invalid') === 'true' && e.target.checkValidity()) {
      e.target.setAttribute('aria-invalid', 'false');
    }
  });

  /* Selects fire 'change' rather than 'input' in some browsers. */
  form.addEventListener('change', function (e) {
    if (e.target.tagName === 'SELECT' && e.target.getAttribute('aria-invalid') === 'true' && e.target.checkValidity()) {
      e.target.setAttribute('aria-invalid', 'false');
    }
  });
})();
