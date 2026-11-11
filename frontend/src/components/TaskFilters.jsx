export function TaskFilters({ filters, categories, onChange, onClear }) {
  const hasActiveFilters = Boolean(
    filters.search ||
    filters.status !== "all" ||
    filters.priority !== "all" ||
    filters.category !== "all",
  );

  return (
    <section className="task-filters motion-glass" aria-label="Filter tasks" data-gravity>
      <div className="task-filters-search">
        <label className="search-filter">
          <span>Search tasks</span>
          <span className="search-filter-field">
            <input
              type="search"
              value={filters.search}
              onChange={(event) => onChange("search", event.target.value)}
              placeholder="Search title or description"
            />
            {filters.search && (
              <button
                className="search-filter-clear"
                type="button"
                aria-label="Clear search"
                onClick={() => onChange("search", "")}
              >
                ×
              </button>
            )}
          </span>
        </label>
        {hasActiveFilters && (
          <button className="clear-filters-button" type="button" onClick={onClear}>
            Clear filters
          </button>
        )}
      </div>

      <div className="task-filter-row">
        <label>
          <span>Status</span>
          <select value={filters.status} onChange={(event) => onChange("status", event.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="in-progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </label>

        <label>
          <span>Priority</span>
          <select value={filters.priority} onChange={(event) => onChange("priority", event.target.value)}>
            <option value="all">All priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>

        <label>
          <span>Category</span>
          <select value={filters.category} onChange={(event) => onChange("category", event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
      </div>
    </section>
  );
}
