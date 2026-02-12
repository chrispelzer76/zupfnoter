/**
 * Default configuration ported from init_conf.rb.
 * Contains all default values for layout, extracts, presets, etc.
 */

export const CONFIG_SEPARATOR = '%%%%zupfnoter.config';

/** Build and return the complete default configuration object. */
export function createDefaultConf(): Record<string, any> {
  const result: Record<string, any> = {};

  result['produce'] = [0];
  result['abc_parser'] = 'ABC2SVG';

  result['restposition'] = {
    default: 'center',
    repeatstart: 'next',
    repeatend: 'default',
  };

  result['template'] = {};
  result['wrap'] = 60;

  // -------------------------------------------------------------------
  // Defaults for frequently-used objects
  // -------------------------------------------------------------------

  result['defaults'] = {
    notebound: {
      annotation: { pos: [5, -7] },
      partname: { pos: [-4, -7] },
      variantend: { pos: [-4, -7] },
      tuplet: { cp1: [5, 2], cp2: [5, -2], shape: ['c'], show: true },
      flowline: { cp1: [0, 10], cp2: [0, -10], shape: ['c'], show: true },
    },
  };

  // -------------------------------------------------------------------
  // Templates for creating new config items
  // -------------------------------------------------------------------

  result['templates'] = {
    notes: { pos: [320, 6], text: 'ENTER_NOTE', style: 'large' },
    lyrics: { verses: [1], pos: [350, 70], style: 'regular' },
    images: { imagename: '', show: true, pos: [10, 10], height: 100 },
    tuplet: { cp1: [5, 2], cp2: [5, -2], shape: ['c'], show: true },
    annotations: { text: '_vorlage_', pos: [-5, -6] },
  };

  // -------------------------------------------------------------------
  // Annotations (built-in note annotations)
  // -------------------------------------------------------------------

  result['annotations'] = {
    vl: { text: 'v', pos: [-5, -5] },
    vt: { text: 'v', pos: [-1, -5] },
    vr: { text: 'v', pos: [2, -5] },
  };

  // -------------------------------------------------------------------
  // Presets
  // -------------------------------------------------------------------

  result['presets'] = {
    // Barnumber/countnote anchor presets
    barnumbers_countnotes: {
      anchor_at_box: {
        barnumbers: { apanchor: 'box' },
        countnotes: { apanchor: 'box' },
      },
      anchor_at_center: {
        barnumbers: { apanchor: 'center' },
        countnotes: { apanchor: 'center' },
      },
    },

    // Layout presets
    layout: {
      notes_small: {
        LINE_MEDIUM: 0.2, LINE_THICK: 0.3,
        ELLIPSE_SIZE: [3.5, 1.3], REST_SIZE: [4, 1.5],
      },
      notes_regular: {
        LINE_MEDIUM: 0.3, LINE_THICK: 0.5,
        ELLIPSE_SIZE: [3.5, 1.7], REST_SIZE: [4, 2],
      },
      notes_large: {
        LINE_MEDIUM: 0.3, LINE_THICK: 0.7,
        ELLIPSE_SIZE: [4, 2], REST_SIZE: [4, 2],
      },
      notes_with_beams: {
        LINE_THIN: 0.1, LINE_MEDIUM: 0.2, LINE_THICK: 0.5,
        ELLIPSE_SIZE: [1.3, 1], REST_SIZE: [2, 1.3], beams: true,
      },
      packer_compact: {
        pack_method: 1, pack_max_spreadfactor: 2, pack_min_increment: 0.20,
      },
      packer_regular: {
        pack_method: 0, pack_max_spreadfactor: 2, pack_min_increment: 0.2,
      },
      color_on: {
        color_default: 'black', color_variant1: 'grey', color_variant2: 'dimgrey',
      },
      color_off: {
        color_default: 'black', color_variant1: 'black', color_variant2: 'black',
      },
      jumpline_anchor_close: { jumpline_anchor: [3, 1] },
      jumpline_anchor_medium: { jumpline_anchor: [5, 1] },
      jumpline_anchor_wide: { jumpline_anchor: [10, 1] },
    },

    // Instrument presets
    instrument: {
      '37-strings-g-g': {
        layout: {
          instrument: '37-strings-g-g',
          limit_a3: true, beams: false, bottomup: false,
          PITCH_OFFSET: -43, X_SPACING: 11.5, X_OFFSET: 2.8,
        },
        stringnames: {
          text: 'G G# A A# B C C# D D# E F F# G G# A A# B C C# D D# E F F# G G# A A# B C C# D D# E F F# G',
          marks: { vpos: [11], hpos: [43, 55, 79] },
        },
        printer: { a4_pages: [0, 1, 2], a4_offset: [-5, 0], a3_offset: [0, 0] },
      },
      '25-strings-g-g': {
        layout: {
          instrument: '25-strings-g-g',
          limit_a3: true, beams: false, bottomup: false,
          PITCH_OFFSET: -55, X_SPACING: 11.5, X_OFFSET: 2.8,
        },
        stringnames: {
          text: 'G A B C D E F G A B C D E F G A B C D E F G A B C',
          marks: { vpos: [11], hpos: [43, 55, 79] },
        },
        printer: { a4_pages: [0, 1, 2], a4_offset: [-5, 0], a3_offset: [0, 0] },
      },
      '25-strings-G-g-Bass': {
        layout: {
          instrument: '25-strings-G-g Bass',
          limit_a3: true, beams: false, bottomup: true,
          PITCH_OFFSET: -31, X_SPACING: 11.5, X_OFFSET: 2.8,
        },
        stringnames: {
          text: 'G A B C D E F G A B C D E F G A B C D E F G A B C',
          marks: { vpos: [11], hpos: [43, 55, 79] },
        },
        printer: { a4_pages: [0, 1, 2], a4_offset: [-5, 0], a3_offset: [0, 0] },
      },
      '21-strings-a-f': {
        layout: {
          instrument: '21-strings-a-f',
          limit_a3: true, beams: false, bottomup: false,
          PITCH_OFFSET: -45, X_SPACING: 11.5, X_OFFSET: 2.8,
        },
        stringnames: {
          text: 'A B C D E F A B C D E F A B C D E F A B C',
          marks: { vpos: [11], hpos: [43, 55, 79] },
        },
        printer: { a4_pages: [0, 1, 2], a4_offset: [-5, 0], a3_offset: [0, 0] },
      },
      '18-strings-b-e': {
        layout: {
          instrument: '18-strings-b-e',
          limit_a3: true, beams: false, bottomup: false,
          PITCH_OFFSET: -47, X_SPACING: 11.5, X_OFFSET: 2.8,
        },
        stringnames: {
          text: 'B C D E B C D E B C D E B C D E B C',
          marks: { vpos: [11], hpos: [43, 55, 79] },
        },
        printer: { a4_pages: [0, 1, 2], a4_offset: [-5, 0], a3_offset: [0, 0] },
      },
      saitenspiel: {
        layout: {
          instrument: 'saitenspiel',
          limit_a3: true, beams: false, bottomup: false,
          PITCH_OFFSET: -48, X_SPACING: 11.5, X_OFFSET: 2.8,
        },
        stringnames: {
          text: 'C D E F G A B C D E F G A B C D E F G',
          marks: { vpos: [11], hpos: [43, 55, 79] },
        },
        printer: { a4_pages: [0, 1, 2], a4_offset: [-5, 0], a3_offset: [0, 0] },
      },
    },

    // Note text presets
    notes: {
      T01_number: { pos: [320, 6], text: '{{number}}', style: 'bold' },
      T01_number_extract: { pos: [320, 6], text: '{{number_extract}}', style: 'bold' },
      T02_copyright_music: { pos: [320, 13], text: '{{copyright_music}}', style: 'small' },
      T03_copyright_harpnotes: { pos: [320, 17], text: '{{copyright_harpnotes}}', style: 'small' },
      T04_to_order: { pos: [320, 20], text: '{{to_order}}', style: 'small' },
      T05_printed_extracts: { pos: [320, 23], text: '{{printed_extracts}}', style: 'small' },
      T06_legend: { pos: [320, 27], text: '{{legend}}', style: 'small' },
      T99_do_not_copy: { pos: [320, 282], text: '{{do_not_copy}}', style: 'small_bold' },
    },

    // Printer presets
    printer: {
      printer_left: { show_border: false, a3_offset: [0, 0], a4_offset: [0, 0] },
      printer_centric: { show_border: false, a3_offset: [0, 0], a4_offset: [-5, 0] },
      printer_right: { show_border: false, a3_offset: [0, 0], a4_offset: [-10, 0] },
    },
  };

  // -------------------------------------------------------------------
  // Global layout
  // -------------------------------------------------------------------

  result['layout'] = {
    grid: false,
    limit_a3: true,
    SHOW_SLUR: false,
    bottomup: false,
    beams: false,
    jumpline_anchor: [3, 1],

    color: {
      color_default: 'black',
      color_variant1: 'grey',
      color_variant2: 'dimgrey',
    },

    LINE_THIN: 0.1,
    LINE_MEDIUM: 0.3,
    LINE_THICK: 0.5,

    PITCH_OFFSET: -43,
    X_SPACING: 11.5,
    X_OFFSET: 2.8,
    Y_SCALE: 4,

    ELLIPSE_SIZE: [3.5, 1.7],
    REST_SIZE: [4, 2],
    DRAWING_AREA_SIZE: [400, 282],

    BEAT_RESOLUTION: 192,
    SHORTEST_NOTE: 64,
    BEAT_PER_DURATION: 3,
    MM_PER_POINT: 0.3,

    instrument: '37-strings-g-g',

    packer: {
      pack_method: 0,
      pack_max_spreadfactor: 2,
      pack_min_increment: 0.2,
    },

    FONT_STYLE_DEF: {
      bold: { text_color: [0, 0, 0], font_size: 12, font_style: 'bold' },
      italic: { text_color: [0, 0, 0], font_size: 12, font_style: 'italic' },
      large: { text_color: [0, 0, 0], font_size: 20, font_style: 'bold' },
      regular: { text_color: [0, 0, 0], font_size: 12, font_style: 'normal' },
      small_bold: { text_color: [0, 0, 0], font_size: 9, font_style: 'bold' },
      small_italic: { text_color: [0, 0, 0], font_size: 9, font_style: 'italic' },
      small: { text_color: [0, 0, 0], font_size: 9, font_style: 'normal' },
      smaller: { text_color: [0, 0, 0], font_size: 6, font_style: 'normal' },
    },

    DURATION_TO_STYLE: {
      err: [2, 'filled', false],
      d64: [1, 'empty', false],
      d48: [0.75, 'empty', true],
      d32: [0.75, 'empty', false],
      d24: [0.75, 'filled', true],
      d16: [0.75, 'filled', false],
      d12: [0.5, 'filled', true],
      d8: [0.5, 'filled', false],
      d6: [0.3, 'filled', true],
      d4: [0.3, 'filled', false],
      d3: [0.1, 'filled', true],
      d2: [0.1, 'filled', false],
      d1: [0.05, 'filled', false],
    },

    DURATION_TO_BEAMS: {
      d64: [1, 'empty', false],
      d48: [1, 'empty', true, 0],
      d32: [1, 'empty', false, 0],
      d24: [1, 'filled', true, 0],
      d16: [1, 'filled', false, 0],
      d12: [1, 'filled', true, 1],
      d8: [1, 'filled', false, 1],
      d6: [1, 'filled', true, 2],
      d4: [1, 'filled', false, 2],
      d3: [1, 'filled', true, 3],
      d2: [1, 'filled', false, 3],
      d1: [1, 'filled', false, 4],
    },

    REST_TO_GLYPH: {
      err: [[2, 2], 'rest_1', false],
      d64: [[1, 0.8], 'rest_1', false],
      d48: [[0.5, 0.4], 'rest_1', true],
      d32: [[0.5, 0.4], 'rest_1', false],
      d24: [[0.4, 0.75], 'rest_4', true],
      d16: [[0.4, 0.75], 'rest_4', false],
      d12: [[0.4, 0.5], 'rest_8', true],
      d8: [[0.4, 0.5], 'rest_8', false],
      d6: [[0.4, 0.3], 'rest_16', true],
      d4: [[0.3, 0.3], 'rest_16', false],
      d3: [[0.3, 0.5], 'rest_32', true],
      d2: [[0.3, 0.5], 'rest_32', false],
      d1: [[0.3, 0.5], 'rest_64', false],
    },
  };

  // -------------------------------------------------------------------
  // Extracts
  // -------------------------------------------------------------------

  const defaultExtract = (): Record<string, any> => ({
    title: 'alle Stimmen',
    startpos: 15,
    voices: [1, 2, 3, 4],
    synchlines: [[1, 2], [3, 4]],
    flowlines: [1, 3],
    subflowlines: [2, 4],
    jumplines: [1, 3],
    layoutlines: [1, 2, 3, 4],
    repeatsigns: {
      voices: [],
      left: { pos: [-7, -2], text: '|:', style: 'bold' },
      right: { pos: [5, -2], text: ':|', style: 'bold' },
    },
    legend: { spos: [320, 27], pos: [320, 7] },
    lyrics: {},
    images: {},
    notes: {},
    layout: {},
    sortmark: { size: [2, 4], fill: true, show: false },
    nonflowrest: false,
    tuplets: { text: '{{tuplet}}' },
    barnumbers: {
      voices: [],
      pos: [6, -4],
      autopos: true,
      apanchor: 'box',
      apbase: [1, 1],
      style: 'small_bold',
      prefix: '',
    },
    countnotes: {
      voices: [],
      pos: [3, -2],
      autopos: true,
      apbase: [1, -0.5],
      apanchor: 'box',
      style: 'smaller',
    },
    stringnames: {
      text: 'G G# A A# B C C# D D# E F F# G G# A A# B C C# D D# E F F# G G# A A# B C C# D D# E F F# G',
      vpos: [],
      style: 'small',
      marks: {
        vpos: [11],
        hpos: [43, 55, 79],
      },
    },
    printer: {
      a3_offset: [0, 0],
      a4_offset: [-5, 0],
      a4_pages: [0, 1, 2],
      show_border: false,
    },
  });

  result['extract'] = {
    0: defaultExtract(),
    1: { ...defaultExtract(), title: 'Sopran, Alt', voices: [1, 2], synchlines: [[1, 2]], flowlines: [1], subflowlines: [2], jumplines: [1], layoutlines: [1, 2] },
    2: { ...defaultExtract(), title: 'Tenor, Bass', voices: [3, 4], synchlines: [[3, 4]], flowlines: [3], subflowlines: [4], jumplines: [3], layoutlines: [3, 4] },
    3: { ...defaultExtract(), title: 'Melodie', voices: [1], synchlines: [], flowlines: [1], subflowlines: [], jumplines: [1], layoutlines: [1] },
    4: { ...defaultExtract(), title: 'Extract 4', voices: [1], synchlines: [], flowlines: [1], subflowlines: [], jumplines: [1], layoutlines: [1] },
    5: { ...defaultExtract(), title: 'Extract 5', voices: [1], synchlines: [], flowlines: [1], subflowlines: [], jumplines: [1], layoutlines: [1] },
  };

  // -------------------------------------------------------------------
  // neatjson formatting options
  // -------------------------------------------------------------------

  result['neatjson'] = {
    wrap: 60,
    aligned: true,
    after_comma: 1,
    after_colon_1: 1,
    after_colon_n: 1,
    before_colon_n: 1,
    short: false,
    decimals: 2,
  };

  return result;
}
