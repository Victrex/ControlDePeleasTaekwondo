const API_BASE = '/api';

class API {
  async request(endpoint, options = {}) {
    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      credentials: 'include'
    };

    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error en la petición');
    }

    return data;
  }

  // Auth
  async login(username, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  }

  async logout() {
    return this.request('/auth/logout', { method: 'POST' });
  }

  async checkSession() {
    return this.request('/auth/session');
  }

  // Config
  async getConfig() {
    return this.request('/config');
  }

  async updateConfig(config) {
    return this.request('/config', {
      method: 'PUT',
      body: JSON.stringify(config)
    });
  }

  // Tournaments
  async getTournaments() {
    return this.request('/tournaments');
  }

  async getActiveTournaments() {
    return this.request('/tournaments/active');
  }

  async getTournament(id) {
    return this.request(`/tournaments/${id}`);
  }

  async createTournament(data) {
    return this.request('/tournaments', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateTournament(id, data) {
    return this.request(`/tournaments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async getPodium(tournamentId) {
    return this.request(`/tournaments/${tournamentId}/podium`);
  }

  async generatePodium(tournamentId) {
    return this.request(`/tournaments/${tournamentId}/podium`, {
      method: 'POST'
    });
  }

  // Fights
  async getFights(tournamentId) {
    return this.request(`/fights/tournament/${tournamentId}`);
  }

  async getCurrentFight(tournamentId) {
    return this.request(`/fights/tournament/${tournamentId}/current`);
  }

  async getNextFight(tournamentId) {
    return this.request(`/fights/tournament/${tournamentId}/next`);
  }

  async getFight(id) {
    return this.request(`/fights/${id}`);
  }

  async createFight(data) {
    return this.request('/fights', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateFight(id, data) {
    return this.request(`/fights/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async reorderFights(fightOrders) {
    return this.request('/fights/reorder', {
      method: 'POST',
      body: JSON.stringify({ fightOrders })
    });
  }

  async registerResult(id, result) {
    return this.request(`/fights/${id}/result`, {
      method: 'POST',
      body: JSON.stringify(result)
    });
  }

  async setCurrentFight(id, tournamentId) {
    return this.request(`/fights/${id}/set-current`, {
      method: 'POST',
      body: JSON.stringify({ tournamentId })
    });
  }

  async completeFight(id, tournamentId) {
    return this.request(`/fights/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ tournamentId })
    });
  }

  async cancelFight(id) {
    return this.request(`/fights/${id}/cancel`, { method: 'POST' });
  }

  async postponeFight(id) {
    return this.request(`/fights/${id}/postpone`, { method: 'POST' });
  }

  async advanceFight(id) {
    return this.request(`/fights/${id}/advance`, { method: 'POST' });
  }

  async deleteFight(id) {
    return this.request(`/fights/${id}`, { method: 'DELETE' });
  }

  async getStats(tournamentId) {
    return this.request(`/fights/tournament/${tournamentId}/stats`);
  }

  // Brackets
  async getBracketsByTournament(tournamentId) {
    return this.request(`/brackets/tournament/${tournamentId}`);
  }

  async getBracket(id) {
    return this.request(`/brackets/${id}`);
  }

  async createBracket(data) {
    return this.request('/brackets', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getBracketCompetitors(bracketId) {
    return this.request(`/brackets/${bracketId}/competitors`);
  }

  async addBracketCompetitor(data) {
    return this.request('/brackets/competitor', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getBracketMatches(bracketId) {
    return this.request(`/brackets/${bracketId}/matches`);
  }

  async generateBracketStructure(bracketId) {
    return this.request(`/brackets/${bracketId}/generate`, {
      method: 'POST'
    });
  }

  async setMatchWinner(matchId, data) {
    return this.request(`/brackets/match/${matchId}/winner`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
}

export default new API();
