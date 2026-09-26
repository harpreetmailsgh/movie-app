import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../lib/store';
import { useSharedFilters, applyFilters } from '../../lib/sharedFilters';
import FilterBar, { filtersActive } from '../../components/FilterBar';
import MovieList from '../../components/MovieList';

export default function SeenScreen() {
  const insets = useSafeAreaInsets();
  const { movies } = useStore();
  const [filters, setFilters] = useSharedFilters();

  const seen = useMemo(() => {
    const list = movies
      .filter((m) => m.status === 'seen')
      .sort((a, b) => b.dateAdded - a.dateAdded);
    return applyFilters(list, filters);
  }, [movies, filters]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top }}>
      <FilterBar values={filters} onChange={setFilters} />
      <MovieList
        movies={seen}
        emptyText={filtersActive(filters) ? 'No movies match these filters.' : 'Nothing here yet.'}
      />
    </View>
  );
}
