// Palm Crest Builders — gallery grouped-by-service rendering.
// Reads data/gallery.json (managed by the /admin CMS) and renders photos
// grouped by service type with a filter bar. If the fetch fails (e.g. opened
// directly from disk with file://), the static server-rendered grid stays.
(function () {
  "use strict";

  var CATEGORIES = [
    { slug: "roofing", label: "Roofing" },
    { slug: "whole-home", label: "Whole-Home Remodeling" },
    { slug: "kitchen", label: "Kitchen Remodeling" },
    { slug: "bathroom", label: "Bathroom Remodeling" },
    { slug: "room-additions", label: "Room Additions" },
    { slug: "adus", label: "ADUs" },
    { slug: "new-construction", label: "New Home Construction" },
    { slug: "garage-conversions", label: "Garage Conversions" },
    { slug: "foundation-structural", label: "Foundation & Structural" },
    { slug: "decks-patios", label: "Decks & Patios" },
    { slug: "commercial", label: "Commercial Tenant Improvements" },
    { slug: "uncategorized", label: "Other Projects" }
  ];

  var labelBySlug = {};
  CATEGORIES.forEach(function (c) { labelBySlug[c.slug] = c.label; });

  var groupsEl = document.getElementById("gallery-groups");
  var filtersEl = document.getElementById("gallery-filters");
  if (!groupsEl) { return; }

  fetch("data/gallery.json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) { throw new Error("no data"); } return r.json(); })
    .then(function (data) {
      var photos = (data && data.photos) || [];
      if (photos.length) { render(photos); }
    })
    .catch(function () { /* keep the static fallback grid */ });

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function render(photos) {
    // newest first
    photos = photos.slice().reverse();

    // group by service
    var groups = {};
    photos.forEach(function (p) {
      var key = (p.service && labelBySlug[p.service]) ? p.service : "uncategorized";
      (groups[key] = groups[key] || []).push(p);
    });

    // Every service category is always shown (with a Coming Soon placeholder
    // when it has no photos yet); "Other Projects" only shows when non-empty.
    var sections = CATEGORIES.filter(function (c) {
      return c.slug !== "uncategorized" || (groups[c.slug] && groups[c.slug].length);
    });

    // filter bar
    if (filtersEl) {
      var btns = ['<button class="gallery-filter is-active" data-filter="all" type="button">All Projects</button>'];
      sections.forEach(function (c) {
        var n = (groups[c.slug] || []).length;
        var badge = n ? ' <span class="gallery-filter-count">' + n + '</span>' : '';
        btns.push(
          '<button class="gallery-filter" data-filter="' + c.slug + '" type="button">' +
          esc(c.label) + badge + '</button>'
        );
      });
      filtersEl.innerHTML = btns.join("");
      filtersEl.hidden = false;
      filtersEl.addEventListener("click", function (e) {
        var b = e.target.closest(".gallery-filter");
        if (!b) { return; }
        var f = b.getAttribute("data-filter");
        var all = filtersEl.querySelectorAll(".gallery-filter");
        for (var j = 0; j < all.length; j++) {
          all[j].classList.toggle("is-active", all[j] === b);
        }
        var secs = groupsEl.querySelectorAll(".gallery-group");
        for (var k = 0; k < secs.length; k++) {
          secs[k].hidden = !(f === "all" || secs[k].getAttribute("data-service") === f);
        }
      });
    }

    // sections (photo grid, or Coming Soon placeholder when empty)
    var html = sections.map(function (c) {
      var list = groups[c.slug] || [];
      var body;
      if (list.length) {
        var cards = list.map(function (p) {
          var alt = p.caption ? esc(p.caption) : (c.label + " project by Palm Crest Builders");
          var title = p.caption ? ' title="' + esc(p.caption) + '"' : "";
          return '<div class="gallery-item"><img src="' + esc(p.image) + '" alt="' + alt + '"' + title + ' loading="lazy"></div>';
        }).join("");
        body = '<div class="gallery-grid">' + cards + '</div>';
      } else {
        body =
          '<div class="gallery-coming-soon">' +
          '<span class="gallery-coming-soon-icon" aria-hidden="true">\uD83D\uDCF8</span>' +
          '<p class="gallery-coming-soon-title">Photos coming soon</p>' +
          '<p>' + esc(c.label) + ' projects are on the way. Want yours featured here?</p>' +
          '<a href="contact.html" class="btn btn-primary">Start Your Project</a>' +
          '</div>';
      }
      var count = list.length ? ' <span class="gallery-group-count">' + list.length + '</span>' : '';
      return '<section class="gallery-group" data-service="' + c.slug + '">' +
        '<h2 class="gallery-group-title">' + esc(c.label) + count + '</h2>' +
        body + '</section>';
    }).join("");

    groupsEl.innerHTML = html;
  }
})();
