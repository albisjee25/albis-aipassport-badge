// V1.0 (v2.5) 风格色板（5 风格 × 14 校准色卡）、双场景副页、7 内置插画形象、6 像素精灵、6 心情与 6 名片渠道。
// 与固件 main/cb_model.c 和定稿画布 P5 / P6 / P7 逐字对齐。

export const STYLES = [
  {
    id: 0, key: 'keycap', name: '解压键帽', hasStatus: true, hasMood: false, hasPassTag: false,
    thumbBg: '#E3ECE8', thumbA: '#FFFFFF', thumbB: '#A4F0D5',
    palettes: [
      {
        name: '薄荷绿', swatch: '#A4F0D5', bg: '#F4F9F6', ink: '#14241E', muted: '#48665B', spot: '#0F9F6E',
        tray: '#E3ECE8', caseBg: '#E3ECE8', caseBorder: '#A9BDB5', caseShadow: '#C7D6D0', wellBg: '#C5D4CE', keyLine: '#738C82',
        aStroke: '#DFE8E4', aLeft: '#EBF2EF', aRight: '#DAE5E0', aBot: '#C0D1CA',
        mainTop: '#A4F0D5', mainSide: '#67C8A6', mTop: '#A4F0D5', mHi: '#D4FFF0', mLeft: '#84DBBC', mRight: '#69C4A4', mBot: '#4EA88A', mInk: '#10261E', mSub: '#2A5948',
      },
      {
        name: '薰衣草紫', swatch: '#D8CEFF', bg: '#F7F5FC', ink: '#1D182E', muted: '#594F7A', spot: '#6D4EE0',
        tray: '#EAE6F5', caseBg: '#EAE6F5', caseBorder: '#B9B0D6', caseShadow: '#D2CBE6', wellBg: '#CFC8E3', keyLine: '#7E749E',
        aStroke: '#E6E2F2', aLeft: '#EFEBF7', aRight: '#E0DAF0', aBot: '#C9C0E0',
        mainTop: '#D8CEFF', mainSide: '#A492E8', mTop: '#D8CEFF', mHi: '#EFEAFF', mLeft: '#C0B2FA', mRight: '#A897EB', mBot: '#8D7AD4', mInk: '#1D1633', mSub: '#4B3E7A',
      },
      {
        name: '奶油黄', swatch: '#FFE04D', bg: '#F2F9FF', ink: '#16202E', muted: '#4E627A', spot: '#D99B00',
        tray: '#E6EFF7', caseBg: '#E6EFF7', caseBorder: '#AEC2D6', caseShadow: '#C8D8E8', wellBg: '#C4D4E3', keyLine: '#7A8EA3',
        aStroke: '#E2EBF2', aLeft: '#ECF3F8', aRight: '#DCE7F0', aBot: '#C2D2E0',
        mainTop: '#FFE04D', mainSide: '#D9AD1C', mTop: '#FFE04D', mHi: '#FFF2A6', mLeft: '#F2C924', mRight: '#DBB014', mBot: '#B89008', mInk: '#241B00', mSub: '#6B5200',
      },
      {
        name: '暖陶橙', swatch: '#F0A47A', bg: '#F7F3EA', ink: '#241C16', muted: '#69594C', spot: '#C85A28',
        tray: '#DDD8CE', caseBg: '#DDD8CE', caseBorder: '#A39C8E', caseShadow: '#C4BEB2', wellBg: '#BEB7AA', keyLine: '#756C5E',
        aStroke: '#EBE5D8', aLeft: '#F2ECE0', aRight: '#E3DACB', aBot: '#CCC1B0',
        mainTop: '#F0A47A', mainSide: '#C47248', mTop: '#F0A47A', mHi: '#FFC7A8', mLeft: '#DE8C62', mRight: '#C7744B', mBot: '#A85C37', mInk: '#26140B', mSub: '#66341C',
      },
    ],
  },
  {
    id: 1, key: 'sticker', name: '心情贴纸', hasStatus: false, hasMood: true, hasPassTag: false,
    thumbBg: '#FFF7DF', thumbA: '#FFD84D', thumbB: '#FF5C3E',
    palettes: [
      { name: '奶油黄', swatch: '#FFD84D', bg: '#FFF7DF', photoBg: '#FFD84D', spot: '#E8432A', muted: '#544B38' },
      { name: '活力橙', swatch: '#FF7D5C', bg: '#FFE866', photoBg: '#FF7D5C', spot: '#D92B14', muted: '#4D3D08' },
      { name: '薄荷绿', swatch: '#A4F5D8', bg: '#D6FFF0', photoBg: '#FFE247', spot: '#0B8A5C', muted: '#1F4D3D' },
    ],
  },
  {
    id: 2, key: 'pass', name: '潮流通行证', hasStatus: false, hasMood: false, hasPassTag: true,
    thumbBg: '#6C80F2', thumbA: '#FFFFFF', thumbB: '#FFE44D',
    palettes: [
      { name: '蔚蓝紫', swatch: '#6C80F2', bg: '#6C80F2', spine: '#FFE44D', avatarBg: '#FFF8E0', ink: '#FFFFFF', muted: '#E2E7FF', rule: '#FFFFFF', badgeBg: '#FFFFFF', badgeInk: '#6C80F2' },
      { name: '薄荷绿', swatch: '#3CD69A', bg: '#3CD69A', spine: '#FFFFFF', avatarBg: '#FFFDF5', ink: '#0E1C16', muted: '#14402E', rule: '#0E1C16', badgeBg: '#0E1C16', badgeInk: '#3CD69A' },
      { name: '琥珀黄', swatch: '#FFB81C', bg: '#FFB81C', spine: '#FFFFFF', avatarBg: '#FFFDF2', ink: '#14120C', muted: '#4A3604', rule: '#14120C', badgeBg: '#14120C', badgeInk: '#FFB81C' },
      { name: '天空蓝', swatch: '#7EC8FF', bg: '#7EC8FF', spine: '#FFFFFF', avatarBg: '#FFFDF5', ink: '#0B1726', muted: '#1B3A5E', rule: '#0B1726', badgeBg: '#0B1726', badgeInk: '#7EC8FF' },
    ],
  },
  {
    id: 3, key: 'pixel', name: '像素冒险', hasStatus: true, hasMood: false, hasPassTag: false,
    thumbBg: '#5C94FC', thumbA: '#FCDC5C', thumbB: '#E52521',
    palettes: [
      { name: '晴空冒险', swatch: '#5C94FC', bg: '#5C94FC', brick: '#C84C0C', brickHi: '#FC9838' },
    ],
  },
  {
    id: 4, key: 'crt', name: '复古终端', hasStatus: true, hasMood: false, hasPassTag: false,
    thumbBg: '#08120B', thumbA: '#32FF6A', thumbB: '#184A27',
    palettes: [
      { name: '荧光绿', swatch: '#2BFF64', bg: '#041408', dark: '#0B2E15', fg: '#2BFF64', dim: '#167832', glow: 'rgba(43,255,100,0.45)', filter: 'grayscale(1) sepia(1) hue-rotate(82deg) saturate(4.2) brightness(1.06) contrast(1.22)' },
      { name: '琥珀金', swatch: '#FFB833', bg: '#140D03', dark: '#2E1E06', fg: '#FFB833', dim: '#8A5D12', glow: 'rgba(255,184,51,0.45)', filter: 'grayscale(1) sepia(1) hue-rotate(4deg) saturate(4.5) brightness(1.06) contrast(1.22)' },
    ],
  },
]

export const SUB_SCENES = [
  { id: 0, key: 'workplace', name: '职场简约' },
  { id: 1, key: 'student',   name: '手账潮玩' },
]

export const MOODS = [
  { id: 0, key: 'happy',     text: '好心情', bg: '#FF5C3E', ink: '#FFFFFF' },
  { id: 1, key: 'coffee',    text: '续命中', bg: '#5C3A21', ink: '#FFFDF5' },
  { id: 2, key: 'spark',     text: '灵感中', bg: '#18B858', ink: '#FFFFFF' },
  { id: 3, key: 'headphone', text: '戴耳机', bg: '#2C7EF2', ink: '#FFFFFF' },
  { id: 4, key: 'buddy',     text: '求搭子', bg: '#E84393', ink: '#FFFFFF' },
  { id: 5, key: 'chill',     text: '放空中', bg: '#6E7785', ink: '#FFFFFF' },
]

export const QR_CHANNELS = [
  { id: 0, key: 'wecom',  name: '企业微信', tag: 'WECOM',  short: '企微', badge: '企', caption: '企业微信', spot: '#1368B8' },
  { id: 1, key: 'wechat', name: '微信好友', tag: 'WECHAT', short: '微信', badge: '微', caption: '微信好友', spot: '#078A45' },
  { id: 2, key: 'red',    name: '小红书',   tag: 'RED',    short: '红书', badge: '书', caption: '小红书',   spot: '#FF2742' },
  { id: 3, key: 'portal', name: '个人主页', tag: 'PORTAL', short: '主页', badge: '页', caption: '个人主页', spot: '#E84B2A' },
  { id: 4, key: 'web',    name: '作品集',   tag: 'WEB',    short: '作品', badge: '作', caption: '作品集',   spot: '#1E2430' },
  { id: 5, key: 'custom', name: '自定义',   tag: 'LINK',   short: '扫码', badge: '码', caption: '二维码',   spot: '#0F9F6E' },
]

export const BUILTIN_AVATARS = [
  { id: 0, key: 'shiba',     name: '打工柴',         stage: '#242730', src: '/assets/avatars/shiba.png' },
  { id: 1, key: 'cat',       name: '赛博酷猫',       stage: '#16202C', src: '/assets/avatars/cat.png' },
  { id: 2, key: 'studio',    name: '咖啡潮人',       stage: '#2A2220', src: '/assets/avatars/studio.png' },
  { id: 3, key: 'folobot',   name: '小电视',         stage: '#1D2421', src: '/assets/avatars/folobot.png' },
  { id: 4, key: 'chillgirl', name: '摸鱼冰美式少女', stage: '#1D2234', src: '/assets/avatars/chillgirl.png' },
  { id: 5, key: 'malfoy',    name: '性转马尔福',     stage: '#232028', src: '/assets/avatars/malfoy.png' },
  { id: 6, key: 'whale',     name: '蓝色大肥鱼',     stage: '#192638', src: '/assets/avatars/whale.png' },
]

export const PIXEL_SPRITES = [
  { id: 0, key: 'capboy',   name: '潮帽少年' },
  { id: 1, key: 'pxshiba',  name: '像素柴犬' },
  { id: 2, key: 'pxcat',    name: '像素酷猫' },
  { id: 3, key: 'pxwhale',  name: '蓝色大肥鱼' },
  { id: 4, key: 'pxmalfoy', name: '性转马尔福' },
  { id: 5, key: 'pxtwin',   name: '赛博双马尾' },
]

export const MBTI_OPTIONS = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP',
]

export const STATUS_COLORS = ['#28E07A', '#38BDF8', '#FFB820', '#FF4D42', '#FF3B30', '#5A6572']
export const MEMO_PAPERS = SUB_SCENES
export const THEMES = STYLES.map((s) => ({ name: s.name, bg: s.thumbBg }))
