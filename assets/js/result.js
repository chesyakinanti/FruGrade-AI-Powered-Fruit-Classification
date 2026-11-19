
/* ============================================================
   FruGrade — Halaman Result
   Membaca hasil analisis dari sessionStorage, merender hasil 12 kelas,
   menganimasikan confidence ring & bar probabilitas, serta mendukung i18n ID/EN.
   ============================================================ */
(function () {
  'use strict';

  window.FG = window.FG || {};

  var $ = FG.util.$;
  var $$ = FG.util.$$;
  var CIRC = 2 * Math.PI * 52;

  var dom = {};
  var data = null;

  function cache() {
    dom.empty = $('#result-empty');
    dom.content = $('#result-content');
    dom.image = $('#result-image');
    dom.fruitName = $('#fruit-name');
    dom.fruitLatin = $('#fruit-latin');
    dom.freshnessChip = $('#freshness-chip');
    dom.freshnessHeadline = $('#freshness-headline');
    dom.freshnessNote = $('#freshness-note');
    dom.freshnessCard = $('#freshness-card');
    dom.confidenceValue = $('#confidence-value');
    dom.confidenceRing = $('#confidence-ring');
    dom.confidenceBlock = $('#confidence-block');
    dom.confidenceNote = $('#confidence-note');
    dom.probList = $('#prob-list');
    dom.metaModel = $('#meta-model');
    dom.metaInput = $('#meta-input');
    dom.metaOutput = $('#meta-output');
    dom.metaLatencyRow = $('#meta-latency-row');
    dom.metaLatency = $('#meta-latency');
    dom.resultTime = $('#result-time');
    dom.resultId = $('#result-id');
    dom.demoBadge = $('#result-demo-badge');
    dom.another = $('#btn-another');
    dom.copy = $('#btn-copy');
    dom.mascot = $('#result-mascot');
    dom.focusBadge = $('#focus-badge');
    dom.focusIcon = $('#focus-icon');
    dom.summary = $('#result-summary');
    dom.demoBadgeInline = $('#result-demo-badge-inline');
    dom.freshnessIcon = $('#freshness-icon');
    dom.sessionChip = $('#session-chip');
    dom.recomCard = $('#recommendation-card');
    dom.recomBadgeIcon = $('#recom-badge-icon');
    dom.recomBadgeTitle = $('#recom-badge-title');
    dom.recomStatusTag = $('#recom-status-tag');
    dom.recomIconContainer = $('#recom-icon-container');
    dom.recomIcon = $('#recom-icon');
    dom.recomActionTitle = $('#recom-action-title');
    dom.recomActionDesc = $('#recom-action-desc');
    dom.recomTipBox = $('#recom-tip-box');
    dom.recomTipIconContainer = $('#recom-tip-icon-container');
    dom.recomTipIcon = $('#recom-tip-icon');
    dom.recomTipTitle = $('#recom-tip-title');
    dom.recomTipDesc = $('#recom-tip-desc');
  }

  /* ---------------- Helpers ---------------- */
  function getLang() {
    return (window.FG && window.FG.i18n && typeof window.FG.i18n.getLang === 'function')
      ? window.FG.i18n.getLang()
      : 'id';
  }

  function t(key, fallback) {
    return (window.FG && window.FG.i18n && typeof window.FG.i18n.t === 'function')
      ? window.FG.i18n.t(key, fallback)
      : (fallback || key);
  }

  function resolveFruitDetails(result) {
    var parsed = FG.parseClass(result.label || result.fruit);
    var lang = getLang();
    var displayName = lang === 'en' ? parsed.nameEn : parsed.nameId;
    return {
      fruitKey: parsed.fruit,
      freshness: parsed.freshness || result.freshness,
      name: displayName,
      latin: parsed.latin,
      image: parsed.image,
      raw: parsed.raw
    };
  }

  function formatDisplayLabel(rawLabel) {
    var parsed = FG.parseClass(rawLabel);
    if (parsed.fruit === 'unknown') return parsed.raw;

    var lang = getLang();
    var fName = lang === 'en' ? parsed.nameEn : parsed.nameId;
    var state = parsed.freshness === 'fresh' ? t('fruit.fresh', 'Segar') : t('fruit.rotten', 'Busuk');

    return lang === 'en' ? (state + ' ' + fName) : (fName + ' ' + state);
  }

  function formatDate(iso) {
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    var lang = getLang();
    try {
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(d).replace(/\./g, ':');
    } catch (e) {
      return d.toLocaleString();
    }
  }

  function makeId(iso) {
    var d = iso ? new Date(iso) : new Date();
    var t = isNaN(d.getTime()) ? Date.now() : d.getTime();
    return '#FRU-' + t.toString(36).slice(-5).toUpperCase();
  }

  /* ---------------- Render ---------------- */
  function render(payload) {
    data = payload;
    var result = payload.result;
    var details = resolveFruitDetails(result);
    var isFresh = details.freshness === 'fresh';
    var isRotten = details.freshness === 'rotten';

    if (dom.empty) { dom.empty.hidden = true; dom.empty.classList.add('is-hidden'); }
    if (dom.content) { dom.content.hidden = false; dom.content.classList.remove('is-hidden'); }

    // Gambar hasil analisis
    if (dom.image) {
      dom.image.src = payload.image || details.image;
      dom.image.alt = details.name;
      dom.image.classList.toggle('saturate-[0.70]', isRotten);
      dom.image.classList.toggle('brightness-[0.98]', isRotten);
    }

    // Nama buah & taksonomi latin
    if (dom.fruitName) dom.fruitName.textContent = details.name;
    if (dom.fruitLatin) dom.fruitLatin.textContent = details.latin ? '(' + details.latin + ')' : '';
    if (dom.resultId) dom.resultId.textContent = makeId(payload.at);
    if (dom.resultTime) dom.resultTime.textContent = formatDate(payload.at);

    // Badge status kesegaran
    if (dom.freshnessChip) {
      dom.freshnessChip.className = 'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 font-label-md text-label-md shadow-sm ' +
        (isFresh ? 'bg-forest-green text-warm-white' : (isRotten ? 'bg-error text-on-error' : 'bg-surface-container text-on-surface-variant'));

      var badgeText = isFresh ? t('result.freshBadge') : (isRotten ? t('result.rottenBadge') : t('result.unknownBadge'));
      var badgeIcon = isFresh ? 'eco' : (isRotten ? 'warning' : 'help');
      dom.freshnessChip.innerHTML = '<span class="icon text-[18px]">' + badgeIcon + '</span><span>' + badgeText + '</span>';
    }

    // Headline & penjelasan kesegaran
    if (dom.freshnessHeadline) {
      dom.freshnessHeadline.textContent = isFresh
        ? t('result.freshHeadline')
        : (isRotten ? t('result.rottenHeadline') : t('result.unknownHeadline'));
    }
    if (dom.freshnessNote) {
      dom.freshnessNote.textContent = isFresh
        ? t('result.freshNote')
        : (isRotten ? t('result.rottenNote') : t('result.unknownNote'));
    }

    if (dom.freshnessCard) {
      dom.freshnessCard.classList.toggle('ring-error-container', isRotten);
      dom.freshnessCard.classList.toggle('bg-error-container/30', isRotten);
      dom.freshnessCard.classList.toggle('bg-surface-container-low', !isRotten);
    }

    if (dom.freshnessIcon) {
      dom.freshnessIcon.textContent = isFresh ? 'task_alt' : (isRotten ? 'warning' : 'help');
      dom.freshnessIcon.className = 'icon text-[24px] ' + (isFresh ? 'text-forest-green' : (isRotten ? 'text-error' : 'text-on-surface-variant'));
    }

    // Metadata model
    if (dom.metaModel) dom.metaModel.textContent = FG.config.model.name + ' (' + FG.config.model.framework + ')';
    if (dom.metaInput) dom.metaInput.textContent = FG.config.model.input;
    if (dom.metaOutput) dom.metaOutput.textContent = t('result.outputVal');

    if (dom.metaLatencyRow && dom.metaLatency) {
      if (typeof result.latency_ms === 'number') {
        dom.metaLatencyRow.hidden = false;
        var s = (result.latency_ms / 1000).toFixed(2);
        dom.metaLatency.textContent = getLang() === 'en' ? (s + ' s') : (s.replace('.', ',') + ' detik');
      } else {
        dom.metaLatencyRow.hidden = true;
      }
    }

    // Badge Demo Mode
    if (dom.demoBadge) {
      dom.demoBadge.hidden = !result.mock;
      dom.demoBadge.classList.toggle('is-hidden', !result.mock);
    }
    if (dom.demoBadgeInline) {
      dom.demoBadgeInline.hidden = !result.mock;
      dom.demoBadgeInline.classList.toggle('is-hidden', !result.mock);
    }
    if (dom.sessionChip) dom.sessionChip.classList.remove('is-hidden');

    // Mascot reaksi
    if (dom.mascot) {
      var supportedMascots = ['apple', 'banana', 'orange', 'mango', 'strawberry', 'tomato'];
      var mascotKey = supportedMascots.indexOf(details.fruitKey) !== -1 ? details.fruitKey : 'apple';
      if (dom.mascot.getAttribute('data-mascot') !== mascotKey) {
        dom.mascot.setAttribute('data-mascot', mascotKey);
        dom.mascot.removeAttribute('data-mounted');
        dom.mascot.innerHTML = '';
        if (FG.fruit && typeof FG.fruit.mount === 'function') FG.fruit.mount();
      }
      if (FG.fruit && typeof FG.fruit.setMood === 'function') {
        FG.fruit.setMood(dom.mascot, isRotten ? 'oops' : null);
      }
    }

    // Badge kualitas fokus
    if (dom.focusBadge) {
      dom.focusBadge.textContent = isFresh ? t('result.qualityGood') : (isRotten ? t('result.qualityNotice') : t('result.qualityUnassessed'));
      dom.focusBadge.className = 'font-label-sm text-label-sm font-semibold ' +
        (isFresh ? 'text-forest-green' : (isRotten ? 'text-error' : 'text-on-surface-variant'));
    }
    if (dom.focusIcon) {
      dom.focusIcon.textContent = isFresh ? 'verified' : (isRotten ? 'warning' : 'help');
      dom.focusIcon.className = 'icon text-[16px] ' +
        (isFresh ? 'text-forest-green' : (isRotten ? 'text-error' : 'text-on-surface-variant'));
    }

    renderConfidence(result);
    renderProbabilities(result);
    renderRecommendation(details);
    updateSummary(result, details);

    animate(isFresh);
  }

  function renderConfidence(result) {
    var conf = result.confidence;

    if (conf == null) {
      if (dom.confidenceBlock) dom.confidenceBlock.hidden = true;
      if (dom.confidenceNote) {
        dom.confidenceNote.hidden = false;
        dom.confidenceNote.textContent = t('result.confMissing');
      }
      return;
    }

    if (dom.confidenceBlock) dom.confidenceBlock.hidden = false;
    if (dom.confidenceValue) dom.confidenceValue.textContent = FG.util.formatPercent(conf, 1);

    var ring = dom.confidenceRing;
    if (ring) {
      ring.style.strokeDasharray = CIRC;
      ring.style.strokeDashoffset = CIRC;
      ring.setAttribute('stroke', result.freshness === 'rotten' ? '#BA1A1A' : '#2E5D3A');
    }
  }

  function renderProbabilities(result) {
    if (!dom.probList) return;

    var probs = Array.isArray(result.probabilities) ? result.probabilities.slice(0, 5) : [];
    if (!probs.length) {
      dom.probList.innerHTML = '<p class="font-body-sm text-body-sm text-on-surface-variant">' + t('result.probMissing') + '</p>';
      return;
    }

    dom.probList.innerHTML = probs.map(function (item, i) {
      var pct = Math.max(0, Math.min(1, Number(item.p) || 0));
      var isTop = i === 0;
      var color = isTop ? (result.freshness === 'rotten' ? '#BA1A1A' : '#2E5D3A') : '#C9C5BE';
      var formattedLabel = formatDisplayLabel(item.label);

      return (
        '<div class="flex flex-col gap-1.5">' +
          '<div class="flex items-center justify-between gap-3">' +
            '<span class="font-label-md text-label-md ' + (isTop ? 'font-semibold text-soft-charcoal' : 'text-on-surface-variant') + '">' +
              FG.util.escapeHtml(formattedLabel) +
            '</span>' +
            '<span class="font-label-sm text-label-sm ' + (isTop ? 'font-bold text-soft-charcoal' : 'text-on-surface-variant') + '">' +
              (pct * 100).toFixed(1) + '%' +
            '</span>' +
          '</div>' +
          '<div class="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">' +
            '<div class="prob-fill h-full rounded-full" data-width="' + (pct * 100).toFixed(2) + '" style="width:0%;background:' + color + '"></div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  /* ---------------- Recommendation Data & Render ---------------- */
  var RECOMMENDATIONS = {
    apple: {
      fresh: {
        actionTitle: { id: 'Siap Dikonsumsi atau Disimpan', en: 'Ready to Consume or Store' },
        actionDesc: { id: 'Apel dalam kondisi segar optimal dengan tekstur renyah dan kaya antioksidan.', en: 'Apple is in optimal fresh condition with crisp texture and rich antioxidants.' },
        tipTitle: { id: 'Tips Penyimpanan Apel', en: 'Apple Storage Tip' },
        tipDesc: { id: 'Simpan di laci kulkas (1–4°C) agar renyah hingga 3–4 minggu. Jauhkan dari sayuran hijau karena apel melepaskan gas etilen alami.', en: 'Store in refrigerator crisper drawer (1–4°C) to keep crisp for 3–4 weeks. Keep away from greens as apples release natural ethylene gas.' }
      },
      rotten: {
        actionTitle: { id: 'Hindari Konsumsi & Segera Pisahkan', en: 'Do Not Consume & Separate Immediately' },
        actionDesc: { id: 'Apel menunjukkan pembusukan jaringan. Jangan dikonsumsi karena berisiko memicu gangguan pencernaan.', en: 'Apple shows tissue decay. Avoid consumption as it may cause digestive issues.' },
        tipTitle: { id: 'Tindakan Penanganan Apel Rusak', en: 'Rotten Apple Handling' },
        tipDesc: { id: 'Segera buang atau jadikan kompos. Satu apel busuk mengeluarkan gas etilen dan spora kapang yang cepat mempercepat pembusukan buah lain di dekatnya.', en: 'Discard or compost immediately. One rotten apple emits high ethylene and mold spores that quickly spoil neighboring produce.' }
      }
    },
    banana: {
      fresh: {
        actionTitle: { id: 'Siap Dikonsumsi Langsung', en: 'Ready to Consume' },
        actionDesc: { id: 'Pisang kaya kalium dan energi alami, sangat baik dikonsumsi langsung atau pelengkap sarapan.', en: 'Banana is rich in potassium and natural energy, ideal for direct consumption or breakfasts.' },
        tipTitle: { id: 'Tips Penyimpanan Pisang', en: 'Banana Storage Tip' },
        tipDesc: { id: 'Simpan di suhu ruang dengan sirkulasi udara baik. Bungkus pangkal tangkai dengan plastik wrap untuk memperlambat pematangan.', en: 'Store at room temperature with good ventilation. Wrap stems with plastic wrap to slow down ethylene ripening.' }
      },
      rotten: {
        actionTitle: { id: 'Periksa Kondisi Daging Buah', en: 'Inspect Flesh Condition' },
        actionDesc: { id: 'Bila hanya berbintik cokelat tanpa jamur/bau asam, masih aman diolah untuk bolu/smoothie. Bila berjamur atau berbau asam tajam, jangan dikonsumsi.', en: 'If heavily spotted without mold or sour odor, it can still be baked into banana bread. If moldy or sharply sour, do not consume.' },
        tipTitle: { id: 'Tindakan Penanganan Pisang Busuk', en: 'Rotten Banana Handling' },
        tipDesc: { id: 'Pisahkan dari buah lain agar tidak memicu pematangan berlebih. Pisang yang berjamur sebaiknya langsung dibuang ke sampah organik.', en: 'Separate from other fruits to prevent over-ripening. Moldy bananas should be discarded or composted.' }
      }
    },
    mango: {
      fresh: {
        actionTitle: { id: 'Siap Dinikmati atau Diolah', en: 'Ready to Enjoy or Process' },
        actionDesc: { id: 'Mangga kaya vitamin C dan serat. Sangat nikmat dimakan langsung, dibuat jus, atau salad buah.', en: 'Mango is rich in vitamin C and fiber. Delicious eaten fresh, juiced, or in salads.' },
        tipTitle: { id: 'Tips Penyimpanan Mangga', en: 'Mango Storage Tip' },
        tipDesc: { id: 'Bila sudah matang harum, simpan di kulkas hingga 4–5 hari. Hindari kulkas bila mangga masih mengkal agar proses matang alaminya tidak berhenti.', en: 'Once ripe and fragrant, refrigerate for up to 4–5 days. Keep unripe mango at room temperature to allow natural ripening.' }
      },
      rotten: {
        actionTitle: { id: 'Hindari Konsumsi', en: 'Do Not Consume' },
        actionDesc: { id: 'Daging mangga yang berlendir, menghitam, atau beraroma fermentasi asam sudah terkontaminasi mikroba pembusuk.', en: 'Mango flesh that is slimy, blackened, or emitting a fermented smell is contaminated with spoilage microbes.' },
        tipTitle: { id: 'Tindakan Penanganan Mangga Rusak', en: 'Rotten Mango Handling' },
        tipDesc: { id: 'Buang ke tempat sampah organik. Bersihkan wadah penyimpanan dari tetesan cairan mangga busuk agar tidak mengundang lalat buah.', en: 'Dispose in organic waste. Wash storage container to remove fermented drips and avoid fruit flies.' }
      }
    },
    orange: {
      fresh: {
        actionTitle: { id: 'Segar & Kaya Vitamin C', en: 'Fresh & High in Vitamin C' },
        actionDesc: { id: 'Jeruk dalam kondisi prima dengan bulir air yang manis dan segar. Bagus untuk menjaga daya tahan tubuh.', en: 'Orange is in prime condition with sweet, juicy pulps. Excellent for daily immune health.' },
        tipTitle: { id: 'Tips Penyimpanan Jeruk', en: 'Orange Storage Tip' },
        tipDesc: { id: 'Simpan di laci sayur kulkas agar kulit tidak mengering dan kesegaran bulir air bertahan hingga 2–3 minggu.', en: 'Store in refrigerator crisper to keep rind from drying out and maintain juice freshness for 2–3 weeks.' }
      },
      rotten: {
        actionTitle: { id: 'Bahaya Jamur Penicillium', en: 'Risk of Penicillium Mold' },
        actionDesc: { id: 'Kulit jeruk yang lunak berair atau diselimuti serbuk jamur hijau/putih berbahaya bagi pernapasan dan pencernaan.', en: 'Citrus rind that is soft or covered in green/white powdery mold is unsafe for consumption.' },
        tipTitle: { id: 'Tindakan Penanganan Jeruk Busuk', en: 'Rotten Orange Handling' },
        tipDesc: { id: 'Bungkus rapat sebelum dibuang agar serbuk spora jamur tidak beterbangan dan menempel ke buah jeruk sehat lainnya.', en: 'Bag tightly before discarding so powdery mold spores do not scatter onto healthy fruits.' }
      }
    },
    strawberry: {
      fresh: {
        actionTitle: { id: 'Kondisi Prima — Nikmati Segera', en: 'Prime Condition — Enjoy Soon' },
        actionDesc: { id: 'Stroberi segar kaya antioksidan dan vitamin C. Paling nikmat dikonsumsi dalam 1–3 hari.', en: 'Fresh strawberry is loaded with antioxidants and vitamin C. Best enjoyed within 1–3 days.' },
        tipTitle: { id: 'Tips Penyimpanan Stroberi', en: 'Strawberry Storage Tip' },
        tipDesc: { id: 'Simpan di kulkas dalam wadah beralas tisu kertas kering. Cuci hanya sesaat sebelum dimakan karena air memicu jamur cepat tumbuh.', en: 'Store unwashed in the fridge on a dry paper towel. Wash only right before eating since water triggers rapid mold.' }
      },
      rotten: {
        actionTitle: { id: 'Waspada Jamur Botrytis Cinerea', en: 'Beware of Gray Mold' },
        actionDesc: { id: 'Stroberi busuk berbulu abu-abu atau lembek berair tidak boleh dimakan karena spora jamur menembus ke dalam daging buah.', en: 'Moldy or squishy strawberries must not be eaten because fungal filaments penetrate deep into the fruit.' },
        tipTitle: { id: 'Tindakan Penanganan Stroberi Busuk', en: 'Rotten Strawberry Handling' },
        tipDesc: { id: 'Segera ambil dan buang stroberi yang berjamur. Spora jamur stroberi menular sangat cepat ke buah di sekelilingnya dalam hitungan jam.', en: 'Remove and discard infected berries right away. Strawberry mold spreads to neighboring berries within hours.' }
      }
    },
    tomato: {
      fresh: {
        actionTitle: { id: 'Segar & Kaya Likopen', en: 'Fresh & Rich in Lycopene' },
        actionDesc: { id: 'Tomat dengan kulit kencang dan warna merata. Sangat baik untuk masakan, jus, atau salad sehat.', en: 'Tomato has firm skin and uniform color. Ideal for cooking, fresh juice, or healthy salads.' },
        tipTitle: { id: 'Tips Penyimpanan Tomat', en: 'Tomato Storage Tip' },
        tipDesc: { id: 'Simpan di suhu ruang dengan posisi tangkai menghadap ke bawah. Hindari kulkas agar teksturnya tidak menjadi bertepung (mealy).', en: 'Store at room temperature stem-down. Avoid refrigeration to prevent texture from turning mealy.' }
      },
      rotten: {
        actionTitle: { id: 'Hindari Konsumsi & Pisahkan Segera', en: 'Do Not Consume & Separate' },
        actionDesc: { id: 'Tomat berbercak hitam lembek atau berbau asam mengandung koloni bakteri pembusuk yang berisiko bagi pencernaan.', en: 'Soft black-spotted or sour-smelling tomatoes contain spoilage bacteria that pose digestive risks.' },
        tipTitle: { id: 'Tindakan Penanganan Tomat Rusak', en: 'Rotten Tomato Handling' },
        tipDesc: { id: 'Segera buang ke tempat sampah organik. Bersihkan wadah bila ada cairan asam yang menetes agar tidak mengundang hama.', en: 'Discard in organic waste. Wipe the container if juices leaked to avoid attracting pests.' }
      }
    }
  };

  var DEFAULT_RECOMMENDATIONS = {
    fresh: {
      actionTitle: { id: 'Siap Dikonsumsi atau Disimpan', en: 'Ready to Consume or Store' },
      actionDesc: { id: 'Buah terdeteksi dalam kondisi segar yang baik untuk dikonsumsi.', en: 'Fruit is detected in good fresh condition for consumption.' },
      tipTitle: { id: 'Tips Penyimpanan Buah Segar', en: 'Fresh Fruit Storage Tip' },
      tipDesc: { id: 'Simpan di tempat yang sejuk dengan sirkulasi udara baik untuk menjaga kesegaran lebih lama.', en: 'Store in a cool place with good air circulation to prolong freshness.' }
    },
    rotten: {
      actionTitle: { id: 'Hindari Konsumsi & Segera Pisahkan', en: 'Do Not Consume & Separate' },
      actionDesc: { id: 'Buah menunjukkan tanda pembusukan visual. Tidak disarankan untuk dikonsumsi.', en: 'Fruit exhibits visual signs of decay. Not recommended for consumption.' },
      tipTitle: { id: 'Tindakan Penanganan Buah Rusak', en: 'Spoiled Fruit Handling' },
      tipDesc: { id: 'Segera pisahkan dari buah segar lainnya dan buang ke tempat sampah organik/kompos.', en: 'Separate immediately from fresh produce and dispose in compost/organic waste.' }
    }
  };

  function renderRecommendation(details) {
    if (!dom.recomCard) return;

    var fruitKey = details.fruitKey;
    var isFresh = details.freshness === 'fresh';
    var isRotten = details.freshness === 'rotten';
    var lang = getLang();

    var fruitRecoms = RECOMMENDATIONS[fruitKey];
    var condRecom = fruitRecoms
      ? (isFresh ? fruitRecoms.fresh : (isRotten ? fruitRecoms.rotten : null))
      : null;

    if (!condRecom) {
      condRecom = isFresh ? DEFAULT_RECOMMENDATIONS.fresh : DEFAULT_RECOMMENDATIONS.rotten;
    }

    var actionTitle = (condRecom.actionTitle && condRecom.actionTitle[lang]) || condRecom.actionTitle.id;
    var actionDesc = (condRecom.actionDesc && condRecom.actionDesc[lang]) || condRecom.actionDesc.id;
    var tipTitle = (condRecom.tipTitle && condRecom.tipTitle[lang]) || condRecom.tipTitle.id;
    var tipDesc = (condRecom.tipDesc && condRecom.tipDesc[lang]) || condRecom.tipDesc.id;

    if (isFresh) {
      dom.recomCard.className = 'mt-5 rounded-2xl border border-forest-green/20 bg-forest-green/[0.04] p-5 sm:p-6 transition-all duration-300 shadow-soft backdrop-blur-sm';
      if (dom.recomBadgeIcon) {
        dom.recomBadgeIcon.textContent = 'eco';
        dom.recomBadgeIcon.className = 'icon text-[18px] text-forest-green';
      }
      if (dom.recomBadgeTitle) {
        dom.recomBadgeTitle.textContent = t('result.recomStorageTitle', 'Rekomendasi Penyimpanan');
        dom.recomBadgeTitle.className = 'font-label-sm text-label-sm font-bold uppercase tracking-[0.12em] text-forest-green';
      }
      if (dom.recomStatusTag) {
        dom.recomStatusTag.textContent = t('result.recomSafeTag', 'Konsumsi Aman');
        dom.recomStatusTag.className = 'rounded-full bg-forest-green/10 text-forest-green px-2.5 py-0.5 font-label-sm text-[11px] font-bold';
      }
      if (dom.recomIconContainer) {
        dom.recomIconContainer.className = 'grid h-10 w-10 flex-none place-items-center rounded-xl bg-forest-green/10 text-forest-green';
      }
      if (dom.recomIcon) dom.recomIcon.textContent = 'check_circle';
      if (dom.recomTipBox) {
        dom.recomTipBox.className = 'mt-3.5 flex items-start gap-3 rounded-xl bg-white/80 p-3.5 border border-forest-green/10 shadow-2xs';
      }
      if (dom.recomTipIconContainer) {
        dom.recomTipIconContainer.className = 'grid h-8 w-8 flex-none place-items-center rounded-lg bg-leaf-green/15 text-leaf-green';
      }
      if (dom.recomTipIcon) dom.recomTipIcon.textContent = 'lightbulb';
    } else {
      dom.recomCard.className = 'mt-5 rounded-2xl border border-error/25 bg-error-container/20 p-5 sm:p-6 transition-all duration-300 shadow-soft backdrop-blur-sm';
      if (dom.recomBadgeIcon) {
        dom.recomBadgeIcon.textContent = 'warning';
        dom.recomBadgeIcon.className = 'icon text-[18px] text-error';
      }
      if (dom.recomBadgeTitle) {
        dom.recomBadgeTitle.textContent = t('result.recomHandlingTitle', 'Saran Penanganan Keamanan Pangan');
        dom.recomBadgeTitle.className = 'font-label-sm text-label-sm font-bold uppercase tracking-[0.12em] text-error';
      }
      if (dom.recomStatusTag) {
        dom.recomStatusTag.textContent = t('result.recomAvoidTag', 'Hindari Konsumsi');
        dom.recomStatusTag.className = 'rounded-full bg-error/15 text-error px-2.5 py-0.5 font-label-sm text-[11px] font-bold';
      }
      if (dom.recomIconContainer) {
        dom.recomIconContainer.className = 'grid h-10 w-10 flex-none place-items-center rounded-xl bg-error/10 text-error';
      }
      if (dom.recomIcon) dom.recomIcon.textContent = 'error';
      if (dom.recomTipBox) {
        dom.recomTipBox.className = 'mt-3.5 flex items-start gap-3 rounded-xl bg-white/80 p-3.5 border border-error/15 shadow-2xs';
      }
      if (dom.recomTipIconContainer) {
        dom.recomTipIconContainer.className = 'grid h-8 w-8 flex-none place-items-center rounded-lg bg-error/10 text-error';
      }
      if (dom.recomTipIcon) dom.recomTipIcon.textContent = 'delete';
    }

    if (dom.recomActionTitle) dom.recomActionTitle.textContent = actionTitle;
    if (dom.recomActionDesc) dom.recomActionDesc.textContent = actionDesc;
    if (dom.recomTipTitle) dom.recomTipTitle.textContent = tipTitle;
    if (dom.recomTipDesc) dom.recomTipDesc.textContent = tipDesc;
  }

  /* ---------------- Build Summary (Lengkap) ---------------- */
  function buildSummary(res, det) {
    var result = res || (data && data.result);
    if (!result) return { plain: '', html: '' };

    var details = det || resolveFruitDetails(result);
    var lang = getLang();
    var isFresh = details.freshness === 'fresh';
    var isRotten = details.freshness === 'rotten';

    var fruitName = details.name || '';
    var statusText = isFresh
      ? t('result.freshBadge')
      : (isRotten ? t('result.rottenBadge') : t('result.unknownBadge'));

    var confText = result.confidence != null
      ? FG.util.formatPercent(result.confidence, 1)
      : t('result.unknownBadge');

    var isId = lang !== 'en';
    var title = isId ? 'Hasil Analisis' : 'Analysis Result';
    var fruitLabel = isId ? 'Jenis buah: ' : 'Fruit Type: ';
    var statusLabel = isId ? 'Status kesegaran: ' : 'Freshness Status: ';
    var confLabel = 'Confidence: ';

    // Ambil rekomendasi berdasarkan jenis buah dan kondisi kesegarannya.
    var fruitRecoms = RECOMMENDATIONS[details.fruitKey];
    var condRecom = fruitRecoms
      ? (isFresh ? fruitRecoms.fresh : (isRotten ? fruitRecoms.rotten : null))
      : null;

    if (!condRecom) {
      condRecom = isFresh
        ? DEFAULT_RECOMMENDATIONS.fresh
        : DEFAULT_RECOMMENDATIONS.rotten;
    }

    // Ambil judul dan penjelasan rekomendasi sesuai bahasa yang aktif.
    var actionTitle = (condRecom.actionTitle && condRecom.actionTitle[lang]) || condRecom.actionTitle.id;
    var actionDesc = (condRecom.actionDesc && condRecom.actionDesc[lang]) || condRecom.actionDesc.id;
    var tipTitle = (condRecom.tipTitle && condRecom.tipTitle[lang]) || condRecom.tipTitle.id;
    var tipDesc = (condRecom.tipDesc && condRecom.tipDesc[lang]) || condRecom.tipDesc.id;

    var recommendationLabel = isId ? 'Rekomendasi:' : 'Recommendation:';
    var handlingLabel = isId ? 'Saran Tindakan:' : 'Suggested Action:';

    // Ringkasan teks biasa untuk clipboard.
    var plain = [
      'FruGrade',
      'AI-Powered Fruit Classification',
      '',
      title,
      fruitLabel + fruitName,
      statusLabel + statusText,
      confLabel + confText,
      '',
      recommendationLabel + ' ' + actionTitle,
      actionDesc,
      '',
      handlingLabel + ' ' + tipTitle,
      tipDesc
    ].join('\n');

    // Versi HTML agar format tetap rapi saat ditempel ke aplikasi rich text.
    var html =
      '<p style="margin:0 0 12px 0;">' +
        '<strong>FruGrade</strong><br>' +
        '<strong>AI-Powered Fruit Classification</strong>' +
      '</p>' +
      '<p style="margin:0 0 12px 0;">' +
        '<strong>' + FG.util.escapeHtml(title) + '</strong><br>' +
        FG.util.escapeHtml(fruitLabel + fruitName) + '<br>' +
        FG.util.escapeHtml(statusLabel + statusText) + '<br>' +
        FG.util.escapeHtml(confLabel + confText) +
      '</p>' +
      '<p style="margin:0 0 12px 0;">' +
        '<strong>' + FG.util.escapeHtml(recommendationLabel + ' ' + actionTitle) + '</strong><br>' +
        FG.util.escapeHtml(actionDesc) +
      '</p>' +
      '<p style="margin:0;">' +
        '<strong>' + FG.util.escapeHtml(handlingLabel + ' ' + tipTitle) + '</strong><br>' +
        FG.util.escapeHtml(tipDesc) +
      '</p>';

    return { plain: plain, html: html };
  }

  function updateSummary(result, details) {
    if (!dom.summary) return;
    var summary = buildSummary(result, details);
    dom.summary.textContent = summary.plain;
  }

  /* ---------------- Animation ---------------- */
  function animate(isFresh) {
    var gsap = window.gsap;
    var reduced = FG.util.prefersReduced();
    var result = data.result;
    var conf = result.confidence;

    if (!gsap || reduced) {
      if (dom.confidenceRing && conf != null) {
        dom.confidenceRing.style.strokeDashoffset = CIRC * (1 - conf);
      }
      $$('.prob-fill', dom.probList).forEach(function (el) {
        el.style.width = el.getAttribute('data-width') + '%';
      });
      return;
    }

    gsap.from(dom.image, {
      scale: 1.05,
      opacity: 0,
      duration: 0.8,
      ease: 'power3.out'
    });

    if (dom.confidenceRing && conf != null) {
      gsap.to(dom.confidenceRing, {
        strokeDashoffset: CIRC * (1 - conf),
        duration: 1.2,
        ease: 'power2.out',
        delay: 0.1
      });
    }

    if (dom.confidenceValue && conf != null) {
      var stateObj = { v: 0 };
      gsap.to(stateObj, {
        v: conf * 100,
        duration: 1.2,
        ease: 'power2.out',
        delay: 0.1,
        onUpdate: function () { dom.confidenceValue.textContent = stateObj.v.toFixed(1) + '%'; }
      });
    }

    var bars = $$('.prob-fill', dom.probList);
    gsap.fromTo(bars, { width: 0 }, {
      width: function (i, el) { return el.getAttribute('data-width') + '%'; },
      duration: 0.85,
      stagger: 0.08,
      delay: 0.25,
      ease: 'power2.out'
    });

    if (isFresh && dom.freshnessCard && FG.fruit && typeof FG.fruit.celebrate === 'function') {
      window.setTimeout(function () {
        FG.fruit.celebrate(dom.freshnessCard);
      }, 600);
    }
  }

  /* ---------------- Actions ---------------- */
  function initActions() {
    if (dom.another) {
      dom.another.addEventListener('click', function () {
        FG.store.clear();
        window.location.href = 'upload.html';
      });
    }

    if (dom.copy) {
      dom.copy.addEventListener('click', function () {
        var summary = buildSummary();
        var plainText = summary.plain || (dom.summary ? dom.summary.textContent : '');
        var htmlText = summary.html || plainText;

        var done = function () {
          var original = dom.copy.innerHTML;
          dom.copy.innerHTML = '<span class="icon text-[20px] text-forest-green">check</span> ' + t('result.copied');
          FG.util.toast(t('result.copySuccess'), { type: 'success', duration: 2600 });
          window.setTimeout(function () { dom.copy.innerHTML = original; }, 2000);
        };

        var execFallback = function () {
          try {
            var ta = document.createElement('textarea');
            ta.value = plainText;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '-9999px';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            if (ok) {
              done();
            } else {
              FG.util.toast(t('result.copyBlocked', 'Akses papan klip diblokir. Silakan salin manual.'), { type: 'error' });
            }
          } catch (e) {
            FG.util.toast(t('result.copyBlocked', 'Akses papan klip diblokir. Silakan salin manual.'), { type: 'error' });
          }
        };

        var fallbackWrite = function () {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(plainText).then(done).catch(execFallback);
          } else {
            execFallback();
          }
        };

        if (navigator.clipboard && typeof window.ClipboardItem !== 'undefined' && navigator.clipboard.write) {
          try {
            var blobHtml = new Blob([htmlText], { type: 'text/html' });
            var blobPlain = new Blob([plainText], { type: 'text/plain' });
            var item = new ClipboardItem({
              'text/html': blobHtml,
              'text/plain': blobPlain
            });
            navigator.clipboard.write([item]).then(done).catch(fallbackWrite);
          } catch (e) {
            fallbackWrite();
          }
        } else {
          fallbackWrite();
        }
      });
    }

    // Re-render dinamik saat pengguna mengubah bahasa
    document.addEventListener('fg:langchange', function () {
      if (data) render(data);
    });
  }

  /* ---------------- Boot ---------------- */
  function init() {
    cache();
    initActions();

    var payload = FG.store.load();
    if (!payload) {
      if (dom.content) { dom.content.hidden = true; dom.content.classList.add('is-hidden'); }
      if (dom.empty) { dom.empty.hidden = false; dom.empty.classList.remove('is-hidden'); }
      if (dom.sessionChip) dom.sessionChip.classList.add('is-hidden');
      return;
    }

    render(payload);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
