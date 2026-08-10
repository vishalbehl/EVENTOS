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
          { id: 'src', type: 'Asset', label: 'Image Asset' },
          { id: 'alt', type: 'Text', label: 'Alt Text' },
          { id: 'data-caption', type: 'Text', label: 'Caption' },
          { id: 'data-link', type: 'Text', label: 'On-click Link' },
        ],
      },
      {
        groupId: 'MEDIA',
        properties: [
          {
            id: 'data-object-fit',
            type: 'Select',
            label: 'Object Fit',
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
            options: [
              { value: 'auto', label: 'Auto' },
              { value: '1/1', label: '1:1 (Square)' },
              { value: '16/9', label: '16:9 (Widescreen)' },
              { value: '4/3', label: '4:3 (Standard)' },
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
            options: [
              { value: 'none', label: 'None' },
              { value: 'grayscale', label: 'Grayscale' },
              { value: 'sepia', label: 'Sepia' },
              { value: 'blur', label: 'Blur' },
            ],
          },
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
          { id: 'data-src', type: 'Text', label: 'Video Source URL (YouTube, Vimeo, MP4)' },
          { id: 'data-poster', type: 'Asset', label: 'Poster Image' },
        ],
      },
      {
        groupId: 'MEDIA',
        properties: [
          { id: 'data-autoplay', type: 'Toggle', label: 'Autoplay' },
          { id: 'data-loop', type: 'Toggle', label: 'Loop' },
          { id: 'data-muted', type: 'Toggle', label: 'Muted', defaultValue: true },
          { id: 'data-controls', type: 'Toggle', label: 'Show Controls', defaultValue: true },
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
          { id: 'data-images', type: 'Textarea', label: 'Images (JSON Array of Assets)' },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-layout-type',
            type: 'Select',
            label: 'Layout Type',
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
          { id: 'data-gap', type: 'Text', label: 'Gap Size', placeholder: 'e.g. 16px' },
          { id: 'data-lightbox', type: 'Toggle', label: 'Enable Lightbox on Click' },
          { id: 'data-rounded', type: 'Text', label: 'Rounded Corners', placeholder: 'e.g. 8px' },
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
          { id: 'data-src', type: 'Text', label: 'Lottie JSON URL' },
        ],
      },
      {
        groupId: 'MEDIA',
        properties: [
          { id: 'data-loop', type: 'Toggle', label: 'Loop' },
          { id: 'data-play-hover', type: 'Toggle', label: 'Play on Hover' },
          { id: 'data-play-scroll', type: 'Toggle', label: 'Play on Scroll' },
        ],
      },
    ]
  }
};
