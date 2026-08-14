import type { ComponentManifest } from '../../PropertyRegistry';

export const ImageManifest: ComponentManifest = {
  id: 'image',
  title: 'Image',
  icon: 'image',
  category: 'Media',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'src', type: 'Asset', label: 'Image Asset', target: { kind: 'attribute', name: 'src', selector: 'img' } },
          { id: 'alt', type: 'Text', label: 'Alt Text', target: { kind: 'attribute', name: 'alt', selector: 'img' } },
          { id: 'data-caption', type: 'Text', label: 'Caption', target: { kind: 'content', selector: '[data-role="caption"]' } },
          { id: 'data-link', type: 'Link', label: 'On-click Link', target: { kind: 'attribute', name: 'href', selector: 'a' } },
        ],
      },
      {
        groupId: 'MEDIA',
        properties: [
          {
            id: 'data-object-fit',
            type: 'Select',
            label: 'Object Fit',
            target: { kind: 'style', css: 'object-fit', selector: 'img' },
            options: [
              { value: 'cover', label: 'Cover' },
              { value: 'contain', label: 'Contain' },
              { value: 'fill', label: 'Fill' },
            ],
          },
          {
            id: 'data-aspect-ratio',
            type: 'Select',
            label: 'Aspect Ratio',
            target: { kind: 'style', css: 'aspect-ratio', selector: 'img' },
            options: [
              { value: 'auto', label: 'Auto' },
              { value: '1/1', label: '1:1 (Square)' },
              { value: '16/9', label: '16:9 (Widescreen)' },
              { value: '4/3', label: '4:3 (Standard)' },
            ],
          },
          {
            id: 'data-object-position',
            type: 'Select',
            label: 'Focal Point',
            target: { kind: 'style', css: 'object-position', selector: 'img' },
            options: [
              { value: 'center center', label: 'Center' },
              { value: 'top center', label: 'Top' },
              { value: 'bottom center', label: 'Bottom' },
              { value: 'left center', label: 'Left' },
              { value: 'right center', label: 'Right' },
            ],
          },
          { id: 'data-scale', type: 'Number', label: 'Scale / Crop Zoom', defaultValue: 1, min: 0.5, max: 3, step: 0.05, target: { kind: 'attribute', name: 'data-scale' } },
          { id: 'data-rotate', type: 'Number', label: 'Rotate', defaultValue: 0, min: -180, max: 180, step: 1, target: { kind: 'attribute', name: 'data-rotate' } },
          {
            id: 'data-shape',
            type: 'Select',
            label: 'Shape',
            target: { kind: 'attribute', name: 'data-shape' },
            options: [
              { value: 'rounded', label: 'Rounded' },
              { value: 'square', label: 'Square' },
              { value: 'circle', label: 'Circle' },
              { value: 'arch', label: 'Arch' },
            ],
          },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          {
            id: 'data-filter',
            type: 'Select',
            label: 'Image Filter',
            target: { kind: 'attribute', name: 'data-filter' },
            options: [
              { value: 'none', label: 'None' },
              { value: 'grayscale', label: 'Grayscale' },
              { value: 'sepia', label: 'Sepia' },
              { value: 'blur', label: 'Blur' },
              { value: 'warm', label: 'Warm' },
              { value: 'cool', label: 'Cool' },
            ],
          },
          { id: 'data-image-animation', type: 'Select', label: 'Image Animation', target: { kind: 'attribute', name: 'data-image-animation' }, options: [
            { value: 'none', label: 'None' },
            { value: 'float', label: 'Float' },
            { value: 'pulse', label: 'Pulse' },
            { value: 'zoom-in', label: 'Slow Zoom' },
          ] },
        ],
      },
    ]
  }
};

export const VideoManifest: ComponentManifest = {
  id: 'video',
  title: 'Video',
  icon: 'video',
  category: 'Media',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-src', type: 'Text', label: 'Video Source URL (YouTube, Vimeo, MP4)', target: { kind: 'attribute', name: 'src', selector: 'iframe,video' } },
          { id: 'data-poster', type: 'Asset', label: 'Poster Image', target: { kind: 'attribute', name: 'poster', selector: 'video' } },
        ],
      },
      {
        groupId: 'MEDIA',
        properties: [
          { id: 'data-autoplay', type: 'Toggle', label: 'Autoplay', target: { kind: 'attribute', name: 'autoplay', selector: 'video' } },
          { id: 'data-loop', type: 'Toggle', label: 'Loop', target: { kind: 'attribute', name: 'loop', selector: 'video' } },
          { id: 'data-muted', type: 'Toggle', label: 'Muted', defaultValue: true, target: { kind: 'attribute', name: 'muted', selector: 'video' } },
          { id: 'data-controls', type: 'Toggle', label: 'Show Controls', defaultValue: true, target: { kind: 'attribute', name: 'controls', selector: 'video' } },
        ],
      },
    ]
  }
};

export const GalleryManifest: ComponentManifest = {
  id: 'gallery',
  title: 'Image Gallery',
  icon: 'grid',
  category: 'Media',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-images', type: 'Textarea', label: 'Images (JSON Array of Assets)', target: { kind: 'attribute', name: 'data-images' } },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-layout-type',
            type: 'Select',
            label: 'Layout Type',
            target: { kind: 'attribute', name: 'data-layout-type' },
            options: [
              { value: 'masonry', label: 'Masonry' },
              { value: 'grid', label: 'Grid' },
              { value: 'slider', label: 'Slider' },
            ],
          },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          { id: 'data-gap', type: 'Text', label: 'Gap Size', placeholder: 'e.g. 16px', target: { kind: 'style', css: 'gap' } },
          { id: 'data-lightbox', type: 'Toggle', label: 'Enable Lightbox on Click', target: { kind: 'attribute', name: 'data-lightbox' } },
          { id: 'data-rounded', type: 'Text', label: 'Rounded Corners', placeholder: 'e.g. 8px', target: { kind: 'style', css: 'border-radius' } },
        ],
      },
    ]
  }
};

export const LottieManifest: ComponentManifest = {
  id: 'lottie',
  title: 'Lottie Animation',
  icon: 'play',
  category: 'Media',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-src', type: 'Text', label: 'Lottie JSON URL', target: { kind: 'attribute', name: 'data-src' } },
        ],
      },
      {
        groupId: 'MEDIA',
        properties: [
          { id: 'data-loop', type: 'Toggle', label: 'Loop', target: { kind: 'attribute', name: 'data-loop' } },
          { id: 'data-play-hover', type: 'Toggle', label: 'Play on Hover', target: { kind: 'attribute', name: 'data-play-hover' } },
          { id: 'data-play-scroll', type: 'Toggle', label: 'Play on Scroll', target: { kind: 'attribute', name: 'data-play-scroll' } },
        ],
      },
    ]
  }
};
