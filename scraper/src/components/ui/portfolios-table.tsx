import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface Portfolio {
    roi: string;
    pnl: string;
    link: string;
    createdAt?: string; // ISO timestamp string
}

interface PortfoliosTableProps {
    portfolios: Record<string, Portfolio>;
}

const LOCAL_STORAGE_KEY = 'checkedPortfolios';

export function PortfoliosTable({ portfolios }: PortfoliosTableProps) {
    // State to track checked portfolios
    const [checkedPortfolios, setCheckedPortfolios] = useState<Record<string, boolean>>({});
    const [isInitialized, setIsInitialized] = useState(false);

    // Load checked state from localStorage on mount - only once
    useEffect(() => {
        try {
            const savedChecked = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (savedChecked) {
                const parsedData = JSON.parse(savedChecked);
                if (typeof parsedData === 'object' && parsedData !== null) {
                    setCheckedPortfolios(parsedData);
                    console.log('Loaded checked portfolios from localStorage:', parsedData);
                }
            }
        } catch (error) {
            console.error('Error loading checked portfolios from localStorage:', error);
            localStorage.removeItem(LOCAL_STORAGE_KEY);
        } finally {
            setIsInitialized(true);
        }
    }, []);

    // Save to localStorage whenever checked state changes, but only after initial load
    useEffect(() => {
        if (!isInitialized) return;

        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(checkedPortfolios));
            console.log('Saved checked portfolios to localStorage:', checkedPortfolios);
        } catch (error) {
            console.error('Error saving checked portfolios to localStorage:', error);
        }
    }, [checkedPortfolios, isInitialized]);

    const handleCheck = (id: string, checked: boolean) => {
        setCheckedPortfolios((prev) => {
            const updated = {
                ...prev,
                [id]: checked,
            };
            return updated;
        });
    };

    // Handler for when a user clicks on a View link
    const handleViewClick = (id: string) => {
        // Mark the portfolio as checked
        setCheckedPortfolios((prev) => {
            const updated = {
                ...prev,
                [id]: true,
            };
            return updated;
        });
    };

    const handleClearAllReadStatus = () => {
        if (window.confirm('Are you sure you want to clear all read status?')) {
            setCheckedPortfolios({});
            localStorage.removeItem(LOCAL_STORAGE_KEY);
        }
    };

    // Format date for display using built-in JavaScript
    const formatDate = (dateString?: string) => {
        if (!dateString) return 'Not available';

        try {
            const date = new Date(dateString);

            // Format the date and time
            const formattedDate = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            });

            const formattedTime = date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            });

            // Calculate relative time
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffSec = Math.floor(diffMs / 1000);
            const diffMin = Math.floor(diffSec / 60);
            const diffHour = Math.floor(diffMin / 60);
            const diffDay = Math.floor(diffHour / 24);

            let relativeTime = '';
            if (Math.abs(diffSec) < 60) {
                relativeTime = `${diffSec} seconds ago`;
            } else if (Math.abs(diffMin) < 60) {
                relativeTime = `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
            } else if (Math.abs(diffHour) < 24) {
                relativeTime = `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
            } else {
                relativeTime = `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
            }

            return `${formattedDate} ${formattedTime} (${relativeTime})`;
        } catch (error) {
            console.error('Error formatting date:', error);
            return dateString;
        }
    };

    // Convert portfolios object to array and reverse it to show newest first
    const portfolioEntries = Object.entries(portfolios).reverse();

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={handleClearAllReadStatus} className="text-xs">
                    Clear All Read Status
                </Button>
            </div>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px] text-center">Read</TableHead>
                            <TableHead className="w-[120px]">Portfolio ID</TableHead>
                            <TableHead className="w-[80px]">ROI</TableHead>
                            <TableHead className="w-[100px]">PNL</TableHead>
                            <TableHead className="w-[80px]">BullX</TableHead>
                            <TableHead className="w-[80px]">GMGN</TableHead>
                            <TableHead className="w-[220px]">Created</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {portfolioEntries.map(([id, portfolio]) => (
                            <TableRow
                                key={id}
                                className={cn(
                                    'transition-colors hover:bg-muted/40',
                                    checkedPortfolios[id] &&
                                        'bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700',
                                )}
                            >
                                <TableCell className="text-center">
                                    <input
                                        type="checkbox"
                                        checked={checkedPortfolios[id] || false}
                                        onChange={(e) => handleCheck(id, e.target.checked)}
                                        className="h-4 w-4 cursor-pointer accent-black bg-white border border-gray-300 rounded"
                                    />
                                </TableCell>
                                <TableCell className="font-medium">{id}</TableCell>
                                <TableCell
                                    className={parseFloat(portfolio.roi) > 1000 ? 'text-green-600 font-medium' : ''}
                                >
                                    {portfolio.roi}
                                </TableCell>
                                <TableCell
                                    className={parseFloat(portfolio.pnl) > 50000 ? 'text-green-600 font-medium' : ''}
                                >
                                    ${Number(portfolio.pnl).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                    <a
                                        href={portfolio.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800 underline"
                                        onClick={() => handleViewClick(id)}
                                    >
                                        View
                                    </a>
                                </TableCell>
                                <TableCell>
                                    <a
                                        href={`https://gmgn.ai/sol/address/${id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800 underline"
                                        onClick={() => handleViewClick(id)}
                                    >
                                        View
                                    </a>
                                </TableCell>
                                <TableCell className="text-sm text-gray-300">
                                    {formatDate(portfolio.createdAt)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
