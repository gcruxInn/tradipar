import React, { useEffect, useState } from "react";
import {
    Text,
    Flex,
    LoadingSpinner,
    Alert,
    hubspot,
    Box,
    Divider,
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
    Select,
    Modal,
    ModalBody,
    Dropdown,
    Icon,
} from "@hubspot/ui-extensions";

interface ItemData {
    id: string;
    name: string;
    quantity: number;
    prices: { pv1: number | null; pv2: number | null; pv3: number | null };
    stock: number;
    stockContext?: string;
    stockOther?: number;
    stockOtherContext?: string;
    currentPrice?: number | null;
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

    // Quote Workflow State
    const [quoteStatus, setQuoteStatus] = useState<any>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteError, setQuoteError] = useState<string | null>(null);
    const [quoteSuccess, setQuoteSuccess] = useState<string | null>(null);

    // Custom Price State (for individual item price override)
    const [customPriceItemId, setCustomPriceItemId] = useState<string | null>(null);
    const [customPriceValue, setCustomPriceValue] = useState<number | undefined>(undefined);
    const [customUnitPriceValue, setCustomUnitPriceValue] = useState<number | undefined>(undefined);

    // Selected prices per item (item.id -> selected unit price)
    const [selectedPrices, setSelectedPrices] = useState<Record<string, number>>({});

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

    // Fetch Quote Status from backend
    const fetchQuoteStatus = async () => {
        try {
            const response = await hubspot.fetch(
                `https://api.gcrux.com/hubspot/quote-status/${context.crm.objectId}`,
                { method: "GET" }
            );
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    setQuoteStatus(result.status);
                }
            }
        } catch (err) {
            console.error("Failed to fetch quote status:", err);
        }
    };

    // Handle Quote Actions (Create / Confirm / Generate PDF)
    const handleQuoteAction = async () => {
        setQuoteLoading(true);
        setQuoteError(null);
        setQuoteSuccess(null);

        try {
            let endpoint = "";
            let body: any = {};

            if (!quoteStatus?.hasQuote) {
                // CREATE QUOTE
                endpoint = "https://api.gcrux.com/hubspot/create-quote";
                body = { dealId: context.crm.objectId };
            } else if (quoteStatus?.buttonAction === "CONFIRM_QUOTE") {
                // CONFIRM QUOTE
                endpoint = "https://api.gcrux.com/hubspot/confirm-quote";
                body = { dealId: context.crm.objectId, nunota: quoteStatus.nunota };
            } else if (quoteStatus?.buttonAction === "GENERATE_PDF") {
                // GENERATE PDF
                endpoint = "https://api.gcrux.com/hubspot/confirm-quote";
                body = { dealId: context.crm.objectId, nunota: quoteStatus.nunota, forceConfirm: true };
            } else {
                throw new Error("Ação não reconhecida");
            }

            const response = await hubspot.fetch(endpoint, {
                method: "POST",
                body
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || "Erro ao processar orçamento");
            }

            setQuoteSuccess(result.message || "Operação realizada com sucesso!");
            // Refresh quote status
            await fetchQuoteStatus();
            setTimeout(() => setQuoteSuccess(null), 5000);

        } catch (err: any) {
            setQuoteError(err.message);
        } finally {
            setQuoteLoading(false);
        }
    };


    // Fetch quote status on mount
    useEffect(() => {
        if (context.crm.objectId) {
            fetchQuoteStatus();
        }
    }, [context.crm.objectId]);

    const formatCurrency = (value: number | null): string => {
        if (value === null || value === undefined) return "---";
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    };

    const handleQuantityChange = (itemId: string, newQty: number | undefined) => {
        if (!data || newQty === undefined || newQty < 0) return;

        const updatedItems = data.items.map(item =>
            item.id === itemId ? { ...item, quantity: newQty } : item
        );

        setData({ ...data, items: updatedItems });
    };

    const handleSaveQuantity = async (itemId: string, newQty: number) => {
        try {
            const response = await hubspot.fetch("https://api.gcrux.com/hubspot/update/line-item", {
                method: "POST",
                body: { lineItemId: itemId, quantity: newQty }
            });
            if (!response.ok) console.error("Failed to save line item quantity");
        } catch (err) {
            console.error(err);
        }
    };

    const handlePVSelect = (item: ItemData, pvKey: string) => {
        if (pvKey === "custom") {
            setCustomPriceItemId(item.id);
            setCustomPriceValue(undefined);
            return;
        }
        // PV selection no longer auto-updates Valor Total
        // User must use the custom price input or the top totals buttons
    };

    const handleApplyItemPrice = async (itemId: string, unitPrice: number) => {
        if (!data) return;

        const item = data.items.find(i => i.id === itemId);
        if (!item) return;

        const total = unitPrice * item.quantity;

        // Update local state
        setSelectedPrices(prev => ({ ...prev, [itemId]: total }));

        // Save price to HubSpot line item
        try {
            const response = await hubspot.fetch("https://api.gcrux.com/hubspot/update/line-item", {
                method: "POST",
                body: { lineItemId: itemId, price: unitPrice }
            });

            if (response.ok) {
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 3000);
            } else {
                console.error("Failed to save item price");
            }
        } catch (err) {
            console.error("Failed to save item price:", err);
        }

        setCustomPriceItemId(null);
        setCustomPriceValue(undefined);
    };

    // Apply a TOTAL value directly (for custom input where user enters total, not unit price)
    const handleApplyItemTotal = async (itemId: string, totalValue: number) => {
        if (!data) return;

        const item = data.items.find(i => i.id === itemId);
        if (!item || item.quantity === 0) return;

        const unitPrice = totalValue / item.quantity;

        // Update local state with the total directly
        setSelectedPrices(prev => ({ ...prev, [itemId]: totalValue }));

        // Save unit price to HubSpot line item
        try {
            const response = await hubspot.fetch("https://api.gcrux.com/hubspot/update/line-item", {
                method: "POST",
                body: { lineItemId: itemId, price: unitPrice }
            });

            if (response.ok) {
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 3000);
            } else {
                console.error("Failed to save item price");
            }
        } catch (err) {
            console.error("Failed to save item price:", err);
        }

        setCustomPriceItemId(null);
        setCustomPriceValue(undefined);
    };

    const handleApplyCustomPrice = () => {
        if (customPriceItemId && customPriceValue !== undefined && customPriceValue >= 0) {
            // Custom value is entered as TOTAL, not unit price
            handleApplyItemTotal(customPriceItemId, customPriceValue);
        }
        setCustomPriceItemId(null);
        setCustomPriceValue(undefined);
        setCustomUnitPriceValue(undefined);
    };

    const handleApplyCustomUnitPrice = () => {
        if (customPriceItemId && customUnitPriceValue !== undefined && customUnitPriceValue >= 0) {
            // Custom value is entered as UNIT price, will be multiplied by qty
            handleApplyItemPrice(customPriceItemId, customUnitPriceValue);
        }
        setCustomPriceItemId(null);
        setCustomPriceValue(undefined);
        setCustomUnitPriceValue(undefined);
    };

    const handleCancelCustomPrice = () => {
        setCustomPriceItemId(null);
        setCustomPriceValue(undefined);
        setCustomUnitPriceValue(undefined);
    };

    // Calculate selected total from selectedPrices
    const calculateSelectedTotal = (): number => {
        return Object.values(selectedPrices).reduce((sum, price) => sum + price, 0);
    };

    // Apply a specific PV to ALL items at once
    const handleApplyAllItemsPV = async (pvKey: "pv1" | "pv2" | "pv3") => {
        if (!data?.items) return;

        let totalAmount = 0;
        const newSelectedPrices: Record<string, number> = {};

        // Update each item
        for (const item of data.items) {
            const unitPrice = item.prices[pvKey] || 0;
            const itemTotal = unitPrice * item.quantity;
            totalAmount += itemTotal;
            newSelectedPrices[item.id] = itemTotal;

            // Save price to HubSpot line item (fire and forget for performance)
            hubspot.fetch("https://api.gcrux.com/hubspot/update/line-item", {
                method: "POST",
                body: { lineItemId: item.id, price: unitPrice }
            }).catch(err => console.error("Failed to save item price:", err));
        }

        // Update local state with all selected prices
        setSelectedPrices(newSelectedPrices);

        // Update and save the total amount
        setAmount(totalAmount);
        handleSaveAmount(totalAmount);

        // Show success
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
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

    // Helper to determine which PV matches the current price
    const getSelectedPV = (item: ItemData): string | undefined => {
        if (!item.currentPrice) return undefined;
        const cp = item.currentPrice;
        // Compare with a small tolerance for floating point
        if (item.prices.pv1 && Math.abs(cp - item.prices.pv1) < 0.01) return "pv1";
        if (item.prices.pv2 && Math.abs(cp - item.prices.pv2) < 0.01) return "pv2";
        if (item.prices.pv3 && Math.abs(cp - item.prices.pv3) < 0.01) return "pv3";
        return undefined;
    };

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
            {/* HEADER: Status & Actions */}
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
                <Flex gap="xs" align="center">
                    {/* Profitability Icon Button */}
                    {quoteStatus?.hasQuote && quoteStatus?.profitability && (
                        <Button
                            variant="transparent"
                            size="sm"
                            overlay={
                                <Modal title="📊 Rentabilidade" id="profitability-modal">
                                    <ModalBody>
                                        <Flex direction="column" gap="xs">
                                            <Flex justify="between">
                                                <Text>Faturamento:</Text>
                                                <Text format={{ fontWeight: "bold" }}>
                                                    {formatCurrency(quoteStatus.profitability.faturamento)}
                                                </Text>
                                            </Flex>
                                            <Flex justify="between">
                                                <Text>Custo Mercadoria (CMV):</Text>
                                                <Text>{formatCurrency(quoteStatus.profitability.custoMercadoriaVendida)} ({quoteStatus.profitability.percentCMV?.toFixed(1)}%)</Text>
                                            </Flex>
                                            <Flex justify="between">
                                                <Text>Gastos Variáveis:</Text>
                                                <Text>{formatCurrency(quoteStatus.profitability.gastoVariavel)} ({quoteStatus.profitability.percentGV?.toFixed(1)}%)</Text>
                                            </Flex>
                                            <Flex justify="between">
                                                <Text>Gastos Fixos:</Text>
                                                <Text>{formatCurrency(quoteStatus.profitability.gastoFixo)} ({quoteStatus.profitability.percentGF?.toFixed(1)}%)</Text>
                                            </Flex>
                                            <Divider />
                                            <Flex justify="between">
                                                <Text>Margem Contribuição:</Text>
                                                <Text format={{ fontWeight: "bold" }}>
                                                    {formatCurrency(quoteStatus.profitability.margemContribuicao)} ({quoteStatus.profitability.percentMC?.toFixed(1)}%)
                                                </Text>
                                            </Flex>
                                            <Flex justify="between" align="center">
                                                <Text format={{ fontWeight: "bold" }}>LUCRO:</Text>
                                                <Tag variant={quoteStatus.isRentavel ? "success" : "error"}>
                                                    {formatCurrency(quoteStatus.profitability.lucro)} ({quoteStatus.profitability.percentLucro?.toFixed(2)}%)
                                                </Tag>
                                            </Flex>
                                        </Flex>
                                    </ModalBody>
                                </Modal>
                            }
                        >
                            📊
                        </Button>
                    )}
                    {/* Actions Dropdown */}
                    <Dropdown
                        buttonText=""
                        variant="transparent"
                        buttonSize="sm"
                    >
                        <Dropdown.ButtonItem onClick={() => fetchPrices()}>
                            ↻ Atualizar Card
                        </Dropdown.ButtonItem>
                        <Dropdown.ButtonItem onClick={() => fetchQuoteStatus()}>
                            🔄 Atualizar Status Orçamento
                        </Dropdown.ButtonItem>
                        {quoteStatus?.hasQuote && (
                            <Dropdown.ButtonItem onClick={() => {
                                window.open(`https://snkbrt01502.ativy.com/mge/nota/${quoteStatus.nunota}`, '_blank');
                            }}>
                                📄 Abrir no Sankhya
                            </Dropdown.ButtonItem>
                        )}
                    </Dropdown>
                </Flex>
            </Flex>
            <Divider />

            {/* GRAND TOTALS & AMOUNT ROW */}
            <Flex direction="row" gap="sm" justify="between" align="center">
                <Button variant="transparent" size="sm" onClick={() => handleApplyAllItemsPV("pv1")}>
                    <Text format={{ fontWeight: "bold" }} inline={true}>Total PV1</Text>
                    <Text inline={true}> {formatCurrency(totals.pv1)} </Text>
                </Button>
                <Text>|</Text>
                <Button variant="transparent" size="sm" onClick={() => handleApplyAllItemsPV("pv2")}>
                    <Text format={{ fontWeight: "bold" }} inline={true}>Total PV2</Text>
                    <Text inline={true}> {formatCurrency(totals.pv2)} </Text>
                </Button>
                <Text>|</Text>
                <Button variant="transparent" size="sm" onClick={() => handleApplyAllItemsPV("pv3")}>
                    <Text format={{ fontWeight: "bold" }} inline={true}>Total PV3</Text>
                    <Text inline={true}> {formatCurrency(totals.pv3)} </Text>
                </Button>
                <Text>|</Text>
                <Box flex="none">
                    <Flex direction="row" gap="xs" align="end">
                        <NumberInput
                            name="amount"
                            label="Valor Total"
                            value={amount}
                            min={0}
                            onChange={(value) => setAmount(value)}
                            onBlur={() => handleSaveAmount()}
                            error={!!saveError}
                            validationMessage={saveError ?? undefined}
                        />
                        {saving && <LoadingSpinner label="Salvando..." size="sm" />}
                        {saveSuccess && <Text variant="microcopy" inline={true}>✓ Salvo!</Text>}
                    </Flex>
                </Box>
            </Flex>
            {saveWarning && <Alert title="Atenção" variant="warning">{saveWarning}</Alert>}

            <Divider />

            {/* COLLAPSIBLE ITEM LIST */}
            <Accordion title={`Ver Detalhes dos ${totalItems} Itens`} defaultOpen={false}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell width={120}>Qtd</TableCell>
                            <TableCell>Produto</TableCell>
                            <TableCell>Qtd / Disp</TableCell>
                            <TableCell>Aplicar Preço</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data?.items.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell width={120}>
                                    <NumberInput
                                        label=""
                                        name={`qty-${item.id}`}
                                        value={item.quantity}
                                        min={0}
                                        onChange={(val) => handleQuantityChange(item.id, val)}
                                        onBlur={() => handleSaveQuantity(item.id, item.quantity)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Flex direction="column" gap="xs">
                                        <Text format={{ fontWeight: "bold" }}>{item.name}</Text>
                                        {item.stockContext && (
                                            <Text variant="microcopy">{item.stockContext}</Text>
                                        )}
                                    </Flex>
                                </TableCell>
                                <TableCell>
                                    <Flex direction="row" gap="sm" align="center">
                                        {/* Selected Company Stock */}
                                        <Flex direction="column" gap="xs">
                                            <Tag variant={item.stock < item.quantity ? "error" : "success"}>
                                                {item.quantity} / {item.stock}
                                            </Tag>
                                            <Text variant="microcopy" format={{ fontWeight: "bold" }}>
                                                {item.stockContext || "Empresa"}
                                            </Text>
                                        </Flex>

                                        {/* Other Company Stock (informational) */}
                                        {item.stockOther !== undefined && (
                                            <Flex direction="column" gap="xs">
                                                <Tag variant="info">
                                                    {item.stockOther} un
                                                </Tag>
                                                <Text variant="microcopy" inline={true}>
                                                    {item.stockOtherContext || "Outra Unidade"}
                                                </Text>
                                            </Flex>
                                        )}
                                    </Flex>
                                </TableCell>
                                <TableCell>
                                    <Flex direction="column" gap="xs">
                                        <Select
                                            label=""
                                            name={`pv-${item.id}`}
                                            value={getSelectedPV(item)}
                                            options={[
                                                { label: `PV1: ${formatCurrency(item.prices.pv1)} /un`, value: "pv1" },
                                                { label: `PV2: ${formatCurrency(item.prices.pv2)} /un`, value: "pv2" },
                                                { label: `PV3: ${formatCurrency(item.prices.pv3)} /un`, value: "pv3" },
                                            ]}
                                            onChange={(val) => {
                                                const prices = item.prices;
                                                let unitPrice = 0;
                                                if (val === "pv1") unitPrice = prices.pv1 || 0;
                                                else if (val === "pv2") unitPrice = prices.pv2 || 0;
                                                else if (val === "pv3") unitPrice = prices.pv3 || 0;
                                                handleApplyItemPrice(item.id, unitPrice);
                                            }}
                                        />
                                        <Button
                                            variant="secondary"
                                            size="xs"
                                            overlay={
                                                <Modal title={`Preço: ${item.name}`} id={`modal-${item.id}`}>
                                                    <ModalBody>
                                                        <Flex direction="column" gap="md">
                                                            {saveSuccess && (
                                                                <Alert title="Sucesso!" variant="success">
                                                                    Preço aplicado! Feche esta janela e confira os valores.
                                                                </Alert>
                                                            )}
                                                            <Text variant="microcopy">Quantidade: {item.quantity} itens</Text>
                                                            <Flex direction="row" gap="md" justify="between">
                                                                <Flex direction="column" gap="xs" align="center">
                                                                    <Text format={{ fontWeight: "bold" }}>PV1 x {item.quantity}</Text>
                                                                    <Text variant="microcopy">Unit: {formatCurrency(item.prices.pv1)}</Text>
                                                                    <Text>{formatCurrency((item.prices.pv1 || 0) * item.quantity)}</Text>
                                                                    <Button variant="secondary" size="xs" onClick={() => handleApplyItemPrice(item.id, item.prices.pv1 || 0)}>Aplicar Total</Button>
                                                                </Flex>
                                                                <Flex direction="column" gap="xs" align="center">
                                                                    <Text format={{ fontWeight: "bold" }}>PV2 x {item.quantity}</Text>
                                                                    <Text variant="microcopy">Unit: {formatCurrency(item.prices.pv2)}</Text>
                                                                    <Text>{formatCurrency((item.prices.pv2 || 0) * item.quantity)}</Text>
                                                                    <Button variant="secondary" size="xs" onClick={() => handleApplyItemPrice(item.id, item.prices.pv2 || 0)}>Aplicar Total</Button>
                                                                </Flex>
                                                                <Flex direction="column" gap="xs" align="center">
                                                                    <Text format={{ fontWeight: "bold" }}>PV3 x {item.quantity}</Text>
                                                                    <Text variant="microcopy">Unit: {formatCurrency(item.prices.pv3)}</Text>
                                                                    <Text>{formatCurrency((item.prices.pv3 || 0) * item.quantity)}</Text>
                                                                    <Button variant="secondary" size="xs" onClick={() => handleApplyItemPrice(item.id, item.prices.pv3 || 0)}>Aplicar Total</Button>
                                                                </Flex>
                                                            </Flex>
                                                            <Divider />
                                                            <Flex direction="row" gap="lg" justify="between">
                                                                <Flex direction="column" gap="xs">
                                                                    <Text format={{ fontWeight: "bold" }}>Valor Total Personalizado:</Text>
                                                                    <Text variant="microcopy">Digite o valor TOTAL. Será dividido por {item.quantity} para calcular o unitário.</Text>
                                                                    <NumberInput
                                                                        label=""
                                                                        name={`custom-total-${item.id}`}
                                                                        value={customPriceValue}
                                                                        min={0}
                                                                        placeholder={`Ex: ${formatCurrency((item.prices.pv1 || 0) * item.quantity)}`}
                                                                        onChange={(val) => setCustomPriceValue(val)}
                                                                    />
                                                                    <Button variant="primary" size="sm" onClick={handleApplyCustomPrice}>Aplicar Total</Button>
                                                                </Flex>
                                                                <Flex direction="column" gap="xs">
                                                                    <Text format={{ fontWeight: "bold" }}>Valor Unitário Personalizado:</Text>
                                                                    <Text variant="microcopy">Digite o preço por UNIDADE. Será multiplicado por {item.quantity}.</Text>
                                                                    <NumberInput
                                                                        label=""
                                                                        name={`custom-unit-${item.id}`}
                                                                        value={customUnitPriceValue}
                                                                        min={0}
                                                                        placeholder={`Ex: ${formatCurrency(item.prices.pv1)}`}
                                                                        onChange={(val) => setCustomUnitPriceValue(val)}
                                                                    />
                                                                    <Button variant="primary" size="sm" onClick={handleApplyCustomUnitPrice}>Aplicar Unitário</Button>
                                                                </Flex>
                                                            </Flex>
                                                        </Flex>
                                                    </ModalBody>
                                                </Modal>
                                            }
                                            onClick={() => { setCustomPriceItemId(item.id); setCustomPriceValue(undefined); }}
                                        >
                                            Personalizado...
                                        </Button>
                                        {selectedPrices[item.id] !== undefined && (
                                            <Text variant="microcopy">Selecionado: {formatCurrency(selectedPrices[item.id])}</Text>
                                        )}
                                    </Flex>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                {/* Footer row with sum button */}
                <Flex justify="end" gap="sm" align="center">
                    <Text format={{ fontWeight: "bold" }}>Total Selecionado: {formatCurrency(calculateSelectedTotal())}</Text>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                            const total = calculateSelectedTotal();
                            setAmount(total);
                            handleSaveAmount(total);
                        }}
                        disabled={Object.keys(selectedPrices).length === 0}
                    >
                        Aplicar ao Valor Total
                    </Button>
                </Flex>
            </Accordion>

            {hasStockIssue && (
                <Alert title="Corte de Estoque" variant="error">
                    Há itens com estoque insuficiente para atender a quantidade solicitada.
                </Alert>
            )}


            <Divider />

            {/* QUOTE WORKFLOW SECTION */}
            <Flex direction="column" gap="sm">
                <Text format={{ fontWeight: "bold" }}>Orçamento Sankhya</Text>

                {quoteStatus?.hasQuote && (
                    <Flex gap="sm" align="center" wrap="wrap">
                        <Tag variant="info">NUNOTA: {quoteStatus.nunota}</Tag>
                        <Tag variant={quoteStatus.isConfirmed ? "success" : "warning"}>
                            {quoteStatus.isConfirmed ? "Confirmado" : "Pendente"}
                        </Tag>
                    </Flex>
                )}

                {quoteError && <Alert title="Erro" variant="error">{quoteError}</Alert>}
                {quoteSuccess && <Alert title="Sucesso" variant="success">{quoteSuccess}</Alert>}

                <Button
                    variant={quoteStatus?.hasQuote ? "secondary" : "primary"}
                    onClick={handleQuoteAction}
                    disabled={quoteLoading || quoteStatus?.buttonAction === "NEEDS_APPROVAL"}
                >
                    {quoteLoading ? "Processando..." : (quoteStatus?.buttonLabel || "Criar Orçamento")}
                </Button>
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


        </Flex >
    );
};

export default PrecosCard;