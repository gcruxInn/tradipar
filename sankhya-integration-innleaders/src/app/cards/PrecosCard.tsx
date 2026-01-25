import React, { useEffect, useState } from "react";
import {
    Text,
    Flex,
    LoadingSpinner,
    Alert,
    hubspot,
    Box,
    Divider,
    Icon,
    Tooltip,
    NumberInput,
    Button,
    Tag,
    Table,
    TableBody,
    TableRow,
    TableCell,
    TableHead,
    Accordion,
} from "@hubspot/ui-extensions";

interface ItemData {
    id: string;
    name: string;
    quantity: number;
    prices: { pv1: number | null; pv2: number | null; pv3: number | null };
    stock: number;
    stockContext?: string;
}

interface PrecosResponse {
    items: ItemData[];
    currentAmount: string;
    currentStage: string;
    stageLabel?: string;
}

// ... (STAGE_MAP removed, using backend label)


hubspot.extend<'crm.record.tab'>(({ context }) => (
    <PrecosCard
        context={context}
    />
));

interface PrecosCardProps {
    context: {
        crm: {
            objectId: number;
            objectType?: string;
        };
    };
}

const PrecosCard = ({ context }: PrecosCardProps) => {
    const [data, setData] = useState<PrecosResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [missingData, setMissingData] = useState<any>(null);

    // Amount State
    const [amount, setAmount] = useState<number | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saveWarning, setSaveWarning] = useState<string | null>(null);

    // Conversion State
    const [converting, setConverting] = useState(false);
    const [convertError, setConvertError] = useState<string | null>(null);
    const [convertSuccess, setConvertSuccess] = useState(false);

    const fetchPrices = async () => {
        setLoading(true);
        setError(null);
        setMissingData(null);

        try {
            const response = await hubspot.fetch("https://api.gcrux.com/hubspot/prices/deal", {
                method: "POST",
                body: { objectId: context.crm.objectId }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erro API: ${response.status} - ${errorText}`);
            }

            const result = await response.json();

            if (result && result.status === "SUCCESS") {
                setData(result);
                if (result.currentAmount) setAmount(Number(result.currentAmount));
            } else if (result && result.status === "MISSING_DATA") {
                setMissingData(result.details);
            } else if (result && result.error) {
                setError(result.error);
            } else {
                setError("Resposta inesperada do servidor.");
            }
        } catch (err: any) {
            console.error("Erro na chamada API:", err);
            setError(`Não foi possível carregar os preços. (${err.message})`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (context.crm.objectId) {
            fetchPrices();
        }
    }, [context.crm.objectId]);

    // ... (handleSaveAmount and handleConvertToOrder logic remains similar, reusing data state)
    const handleSaveAmount = async (valueOverride?: number) => {
        const val = valueOverride !== undefined ? valueOverride : amount;
        if (val === null || val === undefined) return;

        setSaving(true);
        setSaveError(null);
        setSaveSuccess(false);
        setSaveWarning(null);

        try {
            const response = await hubspot.fetch("https://api.gcrux.com/hubspot/update/deal", {
                method: "POST",
                body: {
                    objectId: context.crm.objectId,
                    amount: val
                }
            });

            if (!response.ok) {
                throw new Error("Falha ao salvar valor");
            }

            const result = await response.json();

            if (result.status === "WARNING") {
                setSaveWarning(result.message);
            } else {
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 3000);
            }

        } catch (err: any) {
            setSaveError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleConvertToOrder = async () => {
        setConverting(true);
        setConvertError(null);
        setConvertSuccess(false);

        try {
            const response = await hubspot.fetch("https://api.gcrux.com/hubspot/convert-to-order", {
                method: "POST",
                body: { objectId: context.crm.objectId }
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Erro ao converter para pedido");
            }

            setConvertSuccess(true);
            // Refresh data to update status
            fetchPrices();
            setTimeout(() => setConvertSuccess(false), 5000);

        } catch (err: any) {
            setConvertError(err.message);
        } finally {
            setConverting(false);
        }
    };

    const formatCurrency = (value: number | null): string => {
        if (value === null || value === undefined) return "---";
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    };

    // Calculate Totals
    const totalItems = data?.items.length || 0;
    const totals = React.useMemo(() => {
        if (!data?.items) return { pv1: 0, pv2: 0, pv3: 0 };
        return data.items.reduce((acc, item) => ({
            pv1: acc.pv1 + ((item.prices.pv1 || 0) * item.quantity),
            pv2: acc.pv2 + ((item.prices.pv2 || 0) * item.quantity),
            pv3: acc.pv3 + ((item.prices.pv3 || 0) * item.quantity),
        }), { pv1: 0, pv2: 0, pv3: 0 });
    }, [data]);

    if (loading) return <LoadingSpinner label="Consultando tabelas Sankhya..." />;

    if (missingData) {
        return (
            <Alert title="Dados Incompletos" variant="warning">
                Para visualizar os preços, certifique-se que o negócio tem Parceiro e Itens de Linha.
            </Alert>
        );
    }

    if (error) {
        return (
            <Flex direction="column" gap="sm">
                <Alert title="Erro" variant="error">{error}</Alert>
                <Button onClick={fetchPrices} variant="secondary">Tentar Novamente</Button>
            </Flex>
        );
    }

    const hasStockIssue = data?.items.some(i => i.stock < i.quantity);

    return (
        <Flex direction="column" gap="md">
            {/* HEADER: Status & Refresh */}
            <Flex align="center" justify="between">
                <Flex align="center" gap="sm">
                    <Text format={{ fontWeight: "bold" }}>Status:</Text>
                    {data?.stageLabel ? (
                        <Tag variant={data.currentStage === 'decisionmakerboughtin' ? "warning" : "info"}>
                            {data.stageLabel}
                        </Tag>
                    ) : (
                        <Text>{data?.currentStage}</Text>
                    )}
                </Flex>
                <Button onClick={fetchPrices} variant="tertiary" size="sm">↻ Atualizar</Button>
            </Flex>
            <Divider />

            {/* GRAND TOTALS SECTION */}
            <Flex direction="row" gap="md" justify="between">
                <Box>
                    <Flex align="center" gap="xs"><Text format={{ fontWeight: "bold" }}>Total PV1</Text><Icon name="info" size="sm" /></Flex>
                    <Text format={{ fontWeight: "bold", fontSize: "lg" }}>{formatCurrency(totals.pv1)}</Text>
                    <Button variant="secondary" size="xs" onClick={() => { setAmount(totals.pv1); handleSaveAmount(totals.pv1); }}>Aplicar Total</Button>
                </Box>
                <Divider vertical />
                <Box>
                    <Flex align="center" gap="xs"><Text format={{ fontWeight: "bold" }}>Total PV2</Text></Flex>
                    <Text format={{ fontWeight: "bold", fontSize: "lg" }}>{formatCurrency(totals.pv2)}</Text>
                    <Button variant="secondary" size="xs" onClick={() => { setAmount(totals.pv2); handleSaveAmount(totals.pv2); }}>Aplicar Total</Button>
                </Box>
                <Divider vertical />
                <Box>
                    <Flex align="center" gap="xs"><Text format={{ fontWeight: "bold" }}>Total PV3</Text></Flex>
                    <Text format={{ fontWeight: "bold", fontSize: "lg" }}>{formatCurrency(totals.pv3)}</Text>
                    <Button variant="secondary" size="xs" onClick={() => { setAmount(totals.pv3); handleSaveAmount(totals.pv3); }}>Aplicar Total</Button>
                </Box>
            </Flex>

            <Divider />

            {/* COLLAPSIBLE ITEM LIST */}
            <Accordion title={`Ver Detalhes dos ${totalItems} Itens`} defaultOpen={false}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Produto</TableCell>
                            <TableCell>Estoque (Disp/Nec)</TableCell>
                            <TableCell>Unitário (PV1/PV2/PV3)</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data?.items.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell>
                                    <Flex direction="column" gap="xs">
                                        <Text format={{ fontWeight: "bold" }}>{item.name}</Text>
                                        {item.stockContext && (
                                            <Text variant="microcopy">Contexto: {item.stockContext}</Text>
                                        )}
                                        <Text variant="microcopy">Qtd: {item.quantity}</Text>
                                    </Flex>
                                </TableCell>
                                <TableCell>
                                    <Flex direction="column" gap="xs">
                                        <Tag variant={item.stock < item.quantity ? "error" : "success"}>
                                            {item.stock} / {item.quantity}
                                        </Tag>
                                    </Flex>
                                </TableCell>
                                <TableCell>
                                    <Flex direction="column" gap="xs">
                                        <Button variant="secondary" size="xs" onClick={() => { if (item.prices.pv1) { setAmount(item.prices.pv1); handleSaveAmount(item.prices.pv1); } }}>
                                            PV1: {formatCurrency(item.prices.pv1)}
                                        </Button>
                                        <Button variant="secondary" size="xs" onClick={() => { if (item.prices.pv2) { setAmount(item.prices.pv2); handleSaveAmount(item.prices.pv2); } }}>
                                            PV2: {formatCurrency(item.prices.pv2)}
                                        </Button>
                                        <Button variant="secondary" size="xs" onClick={() => { if (item.prices.pv3) { setAmount(item.prices.pv3); handleSaveAmount(item.prices.pv3); } }}>
                                            PV3: {formatCurrency(item.prices.pv3)}
                                        </Button>
                                    </Flex>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Accordion>

            {hasStockIssue && (
                <Alert title="Corte de Estoque" variant="error">
                    Há itens com estoque insuficiente para atender a quantidade solicitada.
                </Alert>
            )}

            <Divider />

            {/* AMOUNT INPUT SECTION */}
            <Flex direction="column" gap="sm">
                <Text format={{ fontWeight: "bold" }}>Valor do Negócio (Amount)</Text>
                <Flex gap="sm" align="end">
                    <Box flex={1}>
                        <NumberInput
                            name="amount"
                            label="Valor Total"
                            value={amount}
                            min={0}
                            onChange={(value) => setAmount(value)}
                            onBlur={() => handleSaveAmount()}
                            error={!!saveError || !!saveWarning}
                            validationMessage={saveError ?? (saveWarning ?? undefined)}
                        />
                    </Box>
                    {saving && <LoadingSpinner size="sm" />}
                    {saveSuccess && <Text variant="microcopy">✓ Salvo!</Text>}
                </Flex>
                {saveWarning && <Alert title="Atenção" variant="warning">{saveWarning}</Alert>}
            </Flex>

            <Divider />

            {/* ERROR HANDLING FOR CONVERSION */}
            {convertError && <Alert title="Erro" variant="error">{convertError}</Alert>}
            {convertSuccess && <Alert title="Sucesso" variant="success">Pedido gerado!</Alert>}

            <Button
                variant="primary"
                onClick={handleConvertToOrder}
                disabled={converting || hasStockIssue || (data?.currentStage === "decisionmakerboughtin")}
            >
                {converting ? "Gerando Pedido..." : "Faturar (Gerar Pedido)"}
            </Button>

        </Flex>
    );
};

export default PrecosCard;
