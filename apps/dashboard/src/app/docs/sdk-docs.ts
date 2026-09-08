/** Canonical SDK pages shown in the documentation navigation and search. */
export const sdkDocsSections = [
  { id: 'javascript', label: 'JavaScript SDK', category: 'SDKs' },
  { id: 'flutter', label: 'Flutter SDK', category: 'SDKs' },
  { id: 'react-native', label: 'React Native SDK', category: 'SDKs' },
  { id: 'node', label: 'Node.js SDK', category: 'SDKs' },
  { id: 'python', label: 'Python SDK', category: 'SDKs' },
  { id: 'swift', label: 'Swift SDK', category: 'SDKs' },
  { id: 'kotlin', label: 'Kotlin SDK', category: 'SDKs' },
  { id: 'rust', label: 'Rust SDK', category: 'SDKs' },
  { id: 'php', label: 'PHP SDK', category: 'SDKs' }
] as const;

export type SdkDocId = (typeof sdkDocsSections)[number]['id'];
