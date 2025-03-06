import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Button } from './components/ui/button';
import { PortfoliosTable } from './components/ui/portfolios-table';
import io from 'socket.io-client';
import './App.css';
import { toast } from './components/ui/use-toast';

interface Config {
    MIN_PNL: string;
    MIN_ROI: string;
    MAX_TOKENS_TO_PROCESS: string;
    MAX_TRADERS_PER_TOKEN: string;
    START_FROM_ROW: string;
    CHROME_DEBUG_PORT: string;
    BASE_URL: string;
    HOST_IP: string;
}

interface ScraperStatus {
    status: 'running' | 'stopped';
    pid?: number;
}

interface Portfolio {
    roi: string;
    pnl: string;
    link: string;
}

interface ScraperStats {
    portfoliosChecked: number;
}

const defaultConfig: Config = {
    MIN_PNL: '25000',
    MIN_ROI: '2000',
    MAX_TOKENS_TO_PROCESS: '10',
    MAX_TRADERS_PER_TOKEN: '20',
    START_FROM_ROW: '3',
    CHROME_DEBUG_PORT: '9222',
    BASE_URL: 'https://neo.bullx.io',
    HOST_IP: 'localhost',
};

function App() {
    const [config, setConfig] = useState<Config>(defaultConfig);
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [scraperStatus, setScraperStatus] = useState<ScraperStatus>({ status: 'stopped' });
    const [scraperError, setScraperError] = useState<string | null>(null);
    const [portfolios, setPortfolios] = useState<Record<string, Portfolio>>({});
    const [clearingTokens, setClearingTokens] = useState(false);
    const [tokenCount, setTokenCount] = useState<number | null>(null);
    const [scraperStats, setScraperStats] = useState<ScraperStats>({ portfoliosChecked: 0 });

    const fetchConfig = async () => {
        try {
            const response = await fetch('http://localhost:4444/config');
            const data = await response.json();
            setConfig(data);
            setStatus('success');
        } catch (error) {
            console.error('Error fetching config:', error);
            setStatus('error');
        }
    };

    const fetchScraperStatus = async () => {
        try {
            const response = await fetch('http://localhost:4444/scraper/status');
            const data = await response.json();
            if (typeof data === 'object' && data !== null && 'status' in data) {
                setScraperStatus({
                    status: data.status === 'running' ? 'running' : 'stopped',
                    pid: data.pid,
                });
            } else {
                setScraperStatus({ status: 'stopped' });
                throw new Error('Invalid scraper status response');
            }
        } catch (error) {
            console.error('Error fetching scraper status:', error);
            setScraperError(error instanceof Error ? error.message : 'Failed to fetch scraper status');
            setScraperStatus({ status: 'stopped' });
        }
    };

    const fetchPortfolios = async () => {
        try {
            const response = await fetch('http://localhost:4444/portfolios');
            const data = await response.json();
            setPortfolios(data);
        } catch (error) {
            console.error('Error fetching portfolios:', error);
        }
    };

    useEffect(() => {
        // Initial fetches
        fetchConfig();
        fetchScraperStatus();
        fetchPortfolios();

        // Initialize socket connection
        const socket = io('http://localhost:4444');

        socket.on('portfolios-updated', (updatedPortfolios: Record<string, Portfolio>) => {
            console.log('Portfolios updated:', updatedPortfolios);
            setPortfolios(updatedPortfolios);
        });

        // Set up polling for scraper status
        const statusInterval = setInterval(fetchScraperStatus, 5000);

        // Cleanup
        return () => {
            clearInterval(statusInterval);
            socket.disconnect();
        };
    }, []);

    useEffect(() => {
        // Set document title
        document.title = 'WLTR.SCRPR';

        // Fetch portfolios
        fetch('http://localhost:4444/portfolios')
            .then((response) => response.json())
            .then((data) => setPortfolios(data))
            .catch((error) => console.error('Error fetching portfolios:', error));

        // Set up WebSocket connection
        const socket = new WebSocket('ws://localhost:4444');
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'portfolios-updated') {
                setPortfolios(data.portfolios);
            }
        };

        return () => socket.close();
    }, []);

    const handleStartScraper = async () => {
        try {
            const response = await fetch('http://localhost:4444/scraper/start', {
                method: 'POST',
            });
            const data = await response.json();
            if (typeof data === 'object' && data !== null && 'status' in data) {
                setScraperStatus({
                    status: data.status === 'running' ? 'running' : 'stopped',
                    pid: data.pid,
                });
            } else {
                throw new Error('Invalid response from start scraper');
            }
            setScraperError(null);
        } catch (error) {
            console.error('Error starting scraper:', error);
            setScraperError(error instanceof Error ? error.message : 'Failed to start scraper');
            setScraperStatus({ status: 'stopped' });
        }
    };

    const handleStopScraper = async () => {
        try {
            const response = await fetch('http://localhost:4444/scraper/stop', {
                method: 'POST',
            });
            const data = await response.json();
            if (typeof data === 'object' && data !== null && 'status' in data) {
                setScraperStatus({
                    status: data.status === 'running' ? 'running' : 'stopped',
                    pid: data.pid,
                });
            } else {
                throw new Error('Invalid response from stop scraper');
            }
            setScraperError(null);
        } catch (error) {
            console.error('Error stopping scraper:', error);
            setScraperError(error instanceof Error ? error.message : 'Failed to stop scraper');
            setScraperStatus({ status: 'stopped' });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');
        console.log('Updating config:', config);
        try {
            const response = await fetch('http://localhost:4444/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config),
            });
            const data = await response.json();
            setConfig(data);
            setStatus('success');
        } catch (error) {
            console.error('Error updating config:', error);
            setStatus('error');
        }
    };

    const handleInputChange = (key: keyof Config) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setConfig((prev) => ({
            ...prev,
            [key]: e.target.value,
        }));
    };

    const handleClearProcessedTokens = async () => {
        if (!window.confirm('Are you sure you want to clear all processed tokens?')) {
            return;
        }

        setClearingTokens(true);
        try {
            const response = await fetch('http://localhost:4444/clear-processed-tokens', {
                method: 'POST',
            });
            const data = await response.json();
            if (data.success) {
                toast({
                    title: 'Success',
                    description: `Cleared ${data.clearedCount} processed tokens successfully`,
                });
                setTokenCount(0);
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('Error clearing processed tokens:', error);
            toast({
                title: 'Error',
                description: 'Failed to clear processed tokens',
                variant: 'destructive',
            });
        } finally {
            setClearingTokens(false);
        }
    };

    // Add effect to fetch initial token count
    useEffect(() => {
        const fetchTokenCount = async () => {
            try {
                const response = await fetch('http://localhost:4444/processed-tokens');
                if (!response.ok) {
                    throw new Error('Failed to fetch processed tokens');
                }
                const data = await response.json();
                setTokenCount(Array.isArray(data) ? data.length : 0);
            } catch (error) {
                console.error('Error fetching token count:', error);
                setTokenCount(0);
            }
        };
        fetchTokenCount();

        // Set up polling to refresh token count every 5 seconds
        const interval = setInterval(fetchTokenCount, 5000);
        return () => clearInterval(interval);
    }, []);

    // Add effect to fetch scraper stats
    useEffect(() => {
        const fetchScraperStats = async () => {
            try {
                const response = await fetch('http://localhost:4444/scraper-stats');
                if (!response.ok) {
                    throw new Error('Failed to fetch scraper stats');
                }
                const data = await response.json();
                setScraperStats(data);
            } catch (error) {
                console.error('Error fetching scraper stats:', error);
            }
        };

        fetchScraperStats();
        const interval = setInterval(fetchScraperStats, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-gray-100 py-8 px-4">
            <div className="max-w-6xl mx-auto space-y-6">
                <Card className="mb-8 bg-gray-100 shadow-none border-none">
                    <CardHeader>
                        <CardTitle className="text-2xl font-bold tracking-tight">WLTR. Scraper</CardTitle>
                    </CardHeader>
                </Card>
                {/* Scraper Control Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>Scraper Control</CardTitle>
                        <CardDescription>
                            Control and monitor the scraper status. Current status:{' '}
                            <span className={scraperStatus.status === 'running' ? 'text-green-500' : 'text-red-500'}>
                                {scraperStatus.status.toUpperCase()}
                            </span>
                            {scraperStatus.pid && ` (PID: ${scraperStatus.pid})`}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-4">
                            <Button
                                onClick={handleStartScraper}
                                disabled={scraperStatus.status === 'running'}
                                variant={scraperStatus.status === 'running' ? 'secondary' : 'default'}
                            >
                                {scraperStatus.status === 'running' ? 'Running...' : 'Start Scraper'}
                            </Button>
                            <Button
                                onClick={handleStopScraper}
                                disabled={scraperStatus.status !== 'running'}
                                variant="destructive"
                            >
                                Stop Scraper
                            </Button>
                            <Button
                                onClick={handleClearProcessedTokens}
                                disabled={clearingTokens}
                                variant="outline"
                                className="text-white bg-black hover:bg-gray-800"
                            >
                                {clearingTokens ? 'Clearing...' : `Clear Processed Tokens (${tokenCount ?? '...'})`}
                            </Button>
                        </div>
                        {scraperError && <div className="text-red-500 text-sm mt-2">{scraperError}</div>}
                    </CardContent>
                </Card>

                {/* Configuration Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>Configuration Settings</CardTitle>
                        <CardDescription>
                            Update your scraper configuration settings. Changes will be saved to both config.json and
                            .env files.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Minimum PNL</label>
                                <Input
                                    type="number"
                                    value={config.MIN_PNL}
                                    onChange={handleInputChange('MIN_PNL')}
                                    placeholder="Enter minimum PNL"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Minimum ROI</label>
                                <Input
                                    type="number"
                                    value={config.MIN_ROI}
                                    onChange={handleInputChange('MIN_ROI')}
                                    placeholder="Enter minimum ROI"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Max Tokens to Process</label>
                                <Input
                                    type="number"
                                    value={config.MAX_TOKENS_TO_PROCESS}
                                    onChange={handleInputChange('MAX_TOKENS_TO_PROCESS')}
                                    placeholder="Enter max tokens to process"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Max Traders per Token</label>
                                <Input
                                    type="number"
                                    value={config.MAX_TRADERS_PER_TOKEN}
                                    onChange={handleInputChange('MAX_TRADERS_PER_TOKEN')}
                                    placeholder="Enter max traders per token"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Start From Row</label>
                                <Input
                                    type="number"
                                    value={config.START_FROM_ROW}
                                    onChange={handleInputChange('START_FROM_ROW')}
                                    placeholder="Enter start from row"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Chrome Debug Port</label>
                                <Input
                                    type="number"
                                    value={config.CHROME_DEBUG_PORT}
                                    onChange={handleInputChange('CHROME_DEBUG_PORT')}
                                    placeholder="Enter Chrome debug port"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Base URL</label>
                                <Input
                                    type="text"
                                    value={config.BASE_URL}
                                    onChange={handleInputChange('BASE_URL')}
                                    placeholder="Enter base URL"
                                />
                            </div>

                            <div className="grid w-full items-center gap-1.5">
                                <label className="text-sm font-medium">HOST IP</label>
                                <Input
                                    type="text"
                                    id="HOST_IP"
                                    value={config.HOST_IP}
                                    onChange={handleInputChange('HOST_IP')}
                                    placeholder="Enter host IP"
                                />
                                <p className="text-sm text-muted-foreground">
                                    The IP address of the host machine (use 'host.docker.internal' for Docker)
                                </p>
                            </div>

                            <div className="pt-4">
                                <Button type="submit" className="w-full" disabled={status === 'loading'}>
                                    {status === 'loading' ? 'Saving...' : 'Save Configuration'}
                                </Button>
                            </div>

                            {status === 'error' && (
                                <div className="text-red-500 text-sm mt-2">
                                    Failed to update configuration. Please try again.
                                </div>
                            )}

                            {status === 'success' && (
                                <div className="text-green-500 text-sm mt-2">Configuration updated successfully!</div>
                            )}
                        </form>
                    </CardContent>
                </Card>
                {/* Portfolios Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>Found Portfolios</CardTitle>
                        <CardDescription>
                            Live updates of portfolios found by the scraper. Total found:{' '}
                            {Object.keys(portfolios).length} | Total checked: {scraperStats.portfoliosChecked}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <PortfoliosTable portfolios={portfolios} />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default App;
