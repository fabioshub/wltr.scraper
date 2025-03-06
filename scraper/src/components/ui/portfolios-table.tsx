import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface Portfolio {
    roi: string;
    pnl: string;
    link: string;
}

interface PortfoliosTableProps {
    portfolios: Record<string, Portfolio>;
}

export function PortfoliosTable({ portfolios }: PortfoliosTableProps) {
    // State to track checked portfolios
    const [checkedPortfolios, setCheckedPortfolios] = useState<Record<string, boolean>>({});

    // Load checked state from localStorage on mount
    useEffect(() => {
        const savedChecked = localStorage.getItem('checkedPortfolios');
        if (savedChecked) {
            setCheckedPortfolios(JSON.parse(savedChecked));
        }
    }, []);

    // Save to localStorage whenever checked state changes
    useEffect(() => {
        localStorage.setItem('checkedPortfolios', JSON.stringify(checkedPortfolios));
    }, [checkedPortfolios]);

    const handleCheck = (id: string, checked: boolean) => {
        setCheckedPortfolios((prev) => ({
            ...prev,
            [id]: checked,
        }));
    };

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[50px] text-center">Read</TableHead>
                        <TableHead>Portfolio ID</TableHead>
                        <TableHead>ROI</TableHead>
                        <TableHead>PNL</TableHead>
                        <TableHead>BullX</TableHead>
                        <TableHead>GMGN</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {Object.entries(portfolios).map(([id, portfolio]) => (
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
                            <TableCell className={parseFloat(portfolio.roi) > 1000 ? 'text-green-600 font-medium' : ''}>
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
                                >
                                    View
                                </a>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
