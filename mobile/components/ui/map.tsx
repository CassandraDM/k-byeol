// Native map implementation. Metro uses this file on iOS/Android; on web it
// picks map.web.tsx instead, so react-native-maps (native-only) never gets
// bundled for the web.
import MapView, { Callout, Marker } from "react-native-maps";

export { Callout, Marker };
export default MapView;
