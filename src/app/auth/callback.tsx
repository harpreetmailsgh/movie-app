import React from 'react';
import { Redirect } from 'expo-router';

/**
 * OAuth callback landing route. The Google sign-in flow normally completes
 * via the WebBrowser result, but if the OS delivers the redirect through
 * deep linking instead, this route makes sure it lands somewhere valid.
 */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
