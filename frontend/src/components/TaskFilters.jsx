export function TaskFilters({ filters, categories, onChange, onClear }) {
  const hasActiveFilters = Boolean(
    filters.search ||
    filters.status !== "all" ||
    filters.priority !== "all" ||
    filters.category !== "all",
  );

  return (
    <section className="task-filters" aria-label="Filter tasks">
      <label className="search-filter">
        <span>Search tasks</span>
        <input
          type="search"
          value={filters.search}
          onChange={(event) => onChange("search", event.target.value)}
          placeholder="Search title or description"
        />
      </label>

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

      {hasActiveFilters && (
        <button className="clear-filters-button" type="button" onClick={onClear}>
          Clear filters
        </button>
      )}
    </section>
  );
}
