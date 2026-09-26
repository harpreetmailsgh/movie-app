import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MovieList from '../../components/MovieList';

export default function SeenScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top }}>
      <MovieList />
    </View>
  );
}
