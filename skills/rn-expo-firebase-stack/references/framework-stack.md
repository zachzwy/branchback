# Framework Stack — Dependency Matrix

Exact library choices with versions and the role each plays. Versions reflect the reference codebase at the time this skill was authored; bump freely, but verify Expo SDK compatibility first.

## Core runtime
| Package | Version | Role |
|---|---|---|
| `react-native` | 0.81.5 | Mobile runtime |
| `react` | 19.1.0 | UI framework |
| `expo` | ~54.0 | Managed workflow, native module bridging, build pipeline |
| `expo-dev-client` | ~6.0 | Custom dev client for physical-device testing |
| `expo-updates` | ~29.0 | OTA updates |
| `typescript` | ~5.9 | Strict-mode static typing |

## Firebase + auth
| Package | Role |
|---|---|
| `firebase` ^12 | Modular SDK (Auth, Firestore, Storage, Functions) |
| `firebase-admin` ^13 | Admin scripts only (data cleanup, seeding); NOT bundled with the app |
| `@react-native-google-signin/google-signin` ^16 | Google Sign-In |
| `expo-apple-authentication` ~8 | Apple Sign-In (iOS only) |
| `expo-auth-session` ~6 | OAuth flows |
| `expo-crypto` ~15 | Nonce generation for Apple auth |

## Navigation + UI
| Package | Role |
|---|---|
| `@react-navigation/native` ^7.1 | Navigation container |
| `@react-navigation/native-stack` ^7.12 | Native stack navigator |
| `@react-navigation/bottom-tabs` ^7.12 | Bottom tab navigator |
| `react-native-screens` ~4.16 | Native screen optimization |
| `react-native-safe-area-context` ^5.6 | Safe-area insets |
| `react-native-paper` ^5.15 | Material Design 3 component library |
| `@expo/vector-icons` ^15 | Icon set |
| `react-native-vector-icons` ^10 | Additional icon fonts |
| `react-native-svg` 15.12 | SVG rendering |

## Storage + networking
| Package | Role |
|---|---|
| `@react-native-async-storage/async-storage` 2.2 | Local key-value cache |
| `@react-native-community/netinfo` 11.4 | Online/offline detection |
| `react-native-webview` 13.15 | Embedded browser (OAuth, marketing pages) |

## Media + imaging
| Package | Role |
|---|---|
| `expo-image` ~3 | Performant image component with caching |
| `expo-image-picker` ^17 | Camera + photo library access |
| `expo-image-manipulator` ~14 | Client-side compression/resize |
| `expo-video` ~3 | Video playback |
| `expo-video-thumbnails` ~10 | Video frame extraction |
| `expo-media-library` ~18 | Device photo library integration |
| `expo-file-system` ^19 | File I/O |
| `expo-sharing` ^14 | Native share sheet |

## Push + notifications
| Package | Role |
|---|---|
| `expo-notifications` ^0.32 | Local + remote push notifications |
| `@react-native-community/datetimepicker` ^8.6 | Schedule pickers |

## Monetization + subscriptions
| Package | Role |
|---|---|
| `react-native-purchases` ^9.15 | RevenueCat SDK for IAP/subscriptions |

## Analytics + crash reporting
| Package | Role |
|---|---|
| `@sentry/react-native` ~7.2 | Crash reporting + performance monitoring |

## Internationalization
| Package | Role |
|---|---|
| `i18next` ^23 | i18n core |
| `react-i18next` ^15 | React bindings |

## Data viz + gamification
| Package | Role |
|---|---|
| `react-native-chart-kit` ^6.12 | Charts for stats/recaps |
| `react-native-confetti-cannon` ^1.5 | Celebration effects |

## ML + voice
| Package | Role |
|---|---|
| `@jamsch/expo-speech-recognition` ^0.2 | On-device speech-to-text |
| `@infinitered/react-native-mlkit-face-detection` ^5 | Face detection for photo features |

## Native widgets (home screen)
| Package | Role |
|---|---|
| `@bacons/apple-targets` ^4 | iOS widget extension via native Swift target |
| `react-native-android-widget` ^0.20 | Android home-screen widget framework |
| `react-native-widget-center` ^0.0.9 | Cross-platform widget sync helper |

## Testing
| Package | Role |
|---|---|
| `jest` ^29 | Test runner |
| `jest-expo` ~54 | Expo preset (aligns with Expo SDK) |
| `@testing-library/react-native` ^13 | Integration testing with real components |
| `react-test-renderer` ^19 | Snapshot rendering |
| `@types/jest` ^29 | Types |

## Build / dev tooling
| Package | Role |
|---|---|
| `patch-package` ^8 | Apply local node_modules patches (via `postinstall`) |
| `babel-preset-expo` ^55 | Babel preset for Expo |
| EAS (via `eas.json`) | Production builds + submissions |

## Expo config plugins
| Package | Role |
|---|---|
| `expo-splash-screen`, `expo-status-bar`, `expo-system-ui`, `expo-constants`, `expo-device`, `expo-web-browser`, `expo-file-system`, `expo-media-library`, `expo-image-picker`, `expo-notifications`, `expo-video`, `expo-speech-recognition`, `expo-apple-authentication` | Standard Expo plugins configured in `app.json` |
| `@bacons/apple-targets` | Adds iOS Swift widget target at build time |

## External (not npm-installed)
- **Maestro CLI** — install via `curl -Ls "https://get.maestro.mobile.dev" | bash`; drives real simulator/device E2E flows.
- **Firebase CLI** — deploys Cloud Functions from `firebase-setup/`.
- **EAS CLI** — `npm install -g eas-cli` for builds.
